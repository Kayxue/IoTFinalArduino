const { Board, LCD, Sensor, Servo } = require("johnny-five");
const { Hono } = require("hono");
const { serve } = require("@hono/node-server");
const { serveStatic } = require("@hono/node-server/serve-static");
const { createNodeWebSocket } = require("@hono/node-ws");
const path = require("node:path");

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Store connected WebSocket clients
const connectedClients = new Set();

const board = new Board();

// Parking system state
const parkingState = {
  slots: Array(6).fill(false), // false = empty, true = occupied
  totalSlots: 6,
  availableSlots: 6,
  gateOpen: false,
  systemReady: false
};

// Function to broadcast to all connected clients
function broadcast(message) {
  const data = JSON.stringify(message);
  connectedClients.forEach(ws => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(data);
    }
  });
}

// WebSocket endpoint - Fixed configuration
app.get('/ws', upgradeWebSocket((c) => {
  return {
    onOpen(evt, ws) {
      console.log('WebSocket client connected');
      connectedClients.add(ws);
      
      // Send current state to new client
      ws.send(JSON.stringify({
        type: 'parkingUpdate',
        data: parkingState
      }));
    },
    
    onMessage(evt, ws) {
      try {
        console.log('WebSocket message received:', evt.data);
        const message = JSON.parse(evt.data);
        
        switch (message.type) {
          case 'toggleGate':
            if (parkingState.systemReady) {
              // Trigger manual gate toggle
              handleManualGateToggle();
            }
            break;
            
          case 'getStatus':
            ws.send(JSON.stringify({
              type: 'parkingUpdate',
              data: parkingState
            }));
            break;
            
          default:
            console.log('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    },
    
    onClose(evt, ws) {
      console.log('WebSocket client disconnected');
      connectedClients.delete(ws);
    },
    
    onError(evt, ws) {
      console.error('WebSocket error:', evt);
      connectedClients.delete(ws);
    }
  };
}));

// Serve static files BEFORE API routes to avoid conflicts
app.use('/*', serveStatic({ root: './public' }));

// API Routes for parking status
app.get('/api/status', (c) => {
  return c.json(parkingState);
});

app.get('/api/slots', (c) => {
  return c.json({
    slots: parkingState.slots,
    available: parkingState.availableSlots,
    total: parkingState.totalSlots
  });
});

app.post('/api/gate/toggle', async (c) => {
  if (parkingState.systemReady) {
    handleManualGateToggle();
    return c.json({ success: true, message: 'Gate toggle requested' });
  }
  return c.json({ success: false, message: 'System not ready' }, 400);
});

// Manual gate toggle function
function handleManualGateToggle() {
  if (parkingState.systemReady && typeof servo !== 'undefined') {
    const newPosition = parkingState.gateOpen ? 90 : 180;
    servo.to(newPosition);
    parkingState.gateOpen = !parkingState.gateOpen;
    console.log(`Manual gate control: ${parkingState.gateOpen ? 'Opened' : 'Closed'}`);
    broadcast({
      type: 'gateUpdate',
      data: { action: 'manual', gateOpen: parkingState.gateOpen }
    });
  }
}

// Make servo accessible for manual control
let servo;

board.on("ready", () => {
  console.log("Arduino board connected!");
  
  // Initialize LCD
  const lcd = new LCD({ controller: "PCF8574T" });
  
  // Initialize sensors and servo
  const innerSensor = new Sensor.Digital(2);  // Entry sensor
  const outerSensor = new Sensor.Digital(4);  // Exit sensor
  servo = new Servo(3);                       // Gate servo
  
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
    broadcast({
      type: 'parkingUpdate',
      data: parkingState
    });
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
        
        // Broadcast update to web clients
        broadcast({
          type: 'parkingUpdate',
          data: parkingState
        });
        
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
          broadcast({
            type: 'gateUpdate',
            data: { action: 'entry', gateOpen: true }
          });
        }
      } else {
        console.log("Parking full - Entry denied");
        lcd.cursor(0, 0).print("Sorry Parking Full");
        broadcast({
          type: 'parkingUpdate',
          data: { ...parkingState, message: 'Parking Full' }
        });
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
        broadcast({
          type: 'gateUpdate',
          data: { action: 'exit', gateOpen: true }
        });
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
        broadcast({
          type: 'gateUpdate',
          data: { action: 'closed', gateOpen: false }
        });
      }, 1000);
    }
  }, 100);
  
  // Periodic status update
  setInterval(() => {
    if (parkingState.systemReady) {
      updateLCD();
      broadcast({
        type: 'parkingUpdate',
        data: parkingState
      });
    }
  }, 5000);
});

board.on("error", (error) => {
  console.error("Board error:", error);
});

// Setup server with proper WebSocket configuration
const PORT = process.env.PORT || 3000;

const server = serve({
  fetch: app.fetch,
  port: PORT
}, (info) => {
  console.log(`Smart Parking System server running on port ${info.port}`);
  console.log(`Open http://localhost:${info.port} to view the web interface`);
  console.log(`WebSocket endpoint: ws://localhost:${info.port}/ws`);
});

injectWebSocket(server);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  connectedClients.clear();
  process.exit(0);
});

// Export for testing or external use
module.exports = { app, parkingState };