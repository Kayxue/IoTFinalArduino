const { Board, LCD, Sensor, Servo } = require("johnny-five");
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const board = new Board();

// Parking system state
let parkingState = {
  slots: Array(6).fill(false), // false = empty, true = occupied
  totalSlots: 6,
  availableSlots: 6,
  gateOpen: false,
  systemReady: false
};

// Serve static files
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

board.on("ready", () => {
  console.log("Arduino board connected!");
  
  // Initialize LCD
  const lcd = new LCD({ controller: "PCF8574T" });
  
  // Initialize sensors and servo
  const innerSensor = new Sensor.Digital(2);  // Entry sensor
  const outerSensor = new Sensor.Digital(4);  // Exit sensor
  const servo = new Servo(3);                 // Gate servo
  
  // Initialize slot sensors (pins 5-10)
  const slotSensors = [];
  for (let i = 0; i < 6; i++) {
    slotSensors[i] = new Sensor.Digital(i + 5);
    slotSensors[i].slotNum = i;
  }
  
  // Servo gate control flags
  let entryFlag = false;
  let exitFlag = false;
  
  // Initial LCD display
  lcd.clear();
  lcd.cursor(0, 0).print("Smart Parking System");
  lcd.cursor(1, 0).print("Initializing...");
  
  setTimeout(() => {
    parkingState.systemReady = true;
    updateLCD();
    io.emit('parkingUpdate', parkingState);
    console.log("Parking system ready!");
  }, 2000);
  
  // Function to update LCD display
  function updateLCD() {
    lcd.clear();
    lcd.cursor(0, 0).print(`Available: ${parkingState.availableSlots}/${parkingState.totalSlots}`);
    
    // Display slot status (2 slots per row)
    for (let i = 0; i < 6; i++) {
      const row = Math.floor(i / 2) + 1;
      const col = (i % 2) * 10;
      const status = parkingState.slots[i] ? "Fill " : "Empty";
      lcd.cursor(row, col).print(`S${i + 1}:${status}`);
    }
  }
  
  // Function to update available slots count
  function updateSlotCount() {
    const occupiedSlots = parkingState.slots.filter(slot => slot).length;
    parkingState.availableSlots = parkingState.totalSlots - occupiedSlots;
  }
  
  // Slot sensor event handlers
  slotSensors.forEach((sensor, index) => {
    sensor.on("change", function() {
      const wasOccupied = parkingState.slots[index];
      const isOccupied = !this.value; // IR sensor returns 0 when blocked
      
      if (wasOccupied !== isOccupied) {
        parkingState.slots[index] = isOccupied;
        updateSlotCount();
        updateLCD();
        
        // Emit update to web clients
        io.emit('parkingUpdate', parkingState);
        
        console.log(`Slot ${index + 1}: ${isOccupied ? 'Occupied' : 'Empty'}`);
      }
    });
  });
  
  // Entry sensor handler
  innerSensor.on("change", function() {
    if (!this.value && !entryFlag) { // Sensor triggered (car detected)
      if (parkingState.availableSlots > 0) {
        entryFlag = true;
        if (!exitFlag) {
          console.log("Car entering - Opening gate");
          servo.to(180); // Open gate
          parkingState.gateOpen = true;
          io.emit('gateUpdate', { action: 'entry', gateOpen: true });
        }
      } else {
        console.log("Parking full - Entry denied");
        lcd.cursor(0, 0).print("Sorry Parking Full");
        io.emit('parkingUpdate', { ...parkingState, message: 'Parking Full' });
        setTimeout(() => {
          updateLCD();
        }, 2000);
      }
    }
  });
  
  // Exit sensor handler
  outerSensor.on("change", function() {
    if (!this.value && !exitFlag) { // Sensor triggered (car detected)
      exitFlag = true;
      if (!entryFlag) {
        console.log("Car exiting - Opening gate");
        servo.to(180); // Open gate
        parkingState.gateOpen = true;
        io.emit('gateUpdate', { action: 'exit', gateOpen: true });
      }
    }
  });
  
  // Gate control logic - close gate when both sensors are triggered then cleared
  setInterval(() => {
    if (entryFlag && exitFlag) {
      setTimeout(() => {
        console.log("Closing gate");
        servo.to(90); // Close gate
        parkingState.gateOpen = false;
        entryFlag = false;
        exitFlag = false;
        io.emit('gateUpdate', { action: 'closed', gateOpen: false });
      }, 1000);
    }
  }, 100);
  
  // Web socket connection handling
  io.on('connection', (socket) => {
    console.log('Web client connected');
    
    // Send current state to new client
    socket.emit('parkingUpdate', parkingState);
    
    // Handle manual gate control from web interface
    socket.on('toggleGate', () => {
      if (parkingState.systemReady) {
        const newPosition = parkingState.gateOpen ? 90 : 180;
        servo.to(newPosition);
        parkingState.gateOpen = !parkingState.gateOpen;
        console.log(`Manual gate control: ${parkingState.gateOpen ? 'Opened' : 'Closed'}`);
        io.emit('gateUpdate', { action: 'manual', gateOpen: parkingState.gateOpen });
      }
    });
    
    socket.on('disconnect', () => {
      console.log('Web client disconnected');
    });
  });
  
  // Periodic status update
  setInterval(() => {
    if (parkingState.systemReady) {
      updateLCD();
      io.emit('parkingUpdate', parkingState);
    }
  }, 5000);
});

board.on("error", (error) => {
  console.error("Board error:", error);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Smart Parking System server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to view the web interface`);
});