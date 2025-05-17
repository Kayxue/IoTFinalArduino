const { Board, LCD, Sensor, Servo } = require("johnny-five");
const board = new Board();

const dataContainerId = ["", "", "", "", "", ""];

board.on("ready", () => {
  const lcd = new LCD({ controller: "PCF8574T" });

  lcd.cursor(0, 4).print("Parking Full");

  const inner = new Sensor.Digital(2);
  const servo = new Servo(3);
  const outter = new Sensor.Digital(4);
  const slots = [];

  for (let i = 0; i < 6; i++) {
    slots[i] = new Sensor.Digital(i + 5);
    slots[i].slotNum = i;
    slots[i].on("change",  function() {
      if (!this.value) {
        lcd.cursor(Math.floor(this.slotNum / 2) + 1, ((this.slotNum & 1) ? 10 : 0)).print(`S${this.slotNum + 1}:Fill `);
      } else {
        lcd.cursor(Math.floor(this.slotNum / 2) + 1, ((this.slotNum & 1) ? 10 : 0)).print(`S${this.slotNum + 1}:Empty`);
      }
    });
  }
});
