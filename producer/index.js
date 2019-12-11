'use strict';

const amqplib = require('amqplib');
const logger = require('chpr-logger');

const geo = require('./geo.json');
const coordinates = geo.geometry.coordinates[0];
const lc = coordinates.length;

const AMQP_URL = process.env.AMQP_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE = 'drivers';
const ROUTING_KEY = 'drivers.update';
const UNTRUSTWORTHY_MSG_AVG_DELAY_MS = 45000;

let client;

/**
 * Returns the next date for an untrustworthy driver message
 *
 * @returns {Date}
 */
function getNextUntrustworthyMessageDate() {
  return new Date(Date.now() + Math.random() * UNTRUSTWORTHY_MSG_AVG_DELAY_MS);
}


/**
 * Initialize the list of drivers based on the path defined in geo.json
 *
 * @param {number} [n=10]
 * @param {number} [untrustworthyDriversRatio=0.0] The ratio of drivers that will not send all their messages
 * @returns {array} List of drivers
 */
async function init(n = 10, untrustworthyDriversRatio=0.0) {
  logger.info('> RabbitMQ initialization');
  client = await amqplib.connect(AMQP_URL);
  client.channel = await client.createChannel();
  await client.channel.assertExchange(EXCHANGE, 'topic', {
    durable: false
  });


  logger.info('> Drivers initialization');
  const drivers = [];
  for (let i = 0; i < n; i++) {
    const index = Math.round(Math.random() * 1e3) % lc;
    const ratio = Math.random();
    const position = [
      coordinates[index][1] + ratio * (coordinates[(index + 1) % lc][1] - coordinates[index][1]), // latitude
      coordinates[index][0] + ratio * (coordinates[(index + 1) % lc][0] - coordinates[index][0]), // longitude
    ];

    const driver = {
      id: Math.floor(Math.random() * 1e12),
      final: position,
      position: [
        position[0] + (Math.random() - 0.5) * 2 * 1e-1,
        position[1] + (Math.random() - 0.5) * 2 * 1e-1
      ]
    };
    if (Math.random() < untrustworthyDriversRatio) {
      driver.untrustworthy = {
        nextMessageDate: getNextUntrustworthyMessageDate(),
      };
    }

    drivers.push(driver);
  }

  return drivers;
}

/**
 * Animate the drivers and update their respective positions
 * Send as many messages per minutes that the total number of drivers
 *
 * @param {array} drivers
 * @param {number} [interval=10]
 * @param {number} previousInterval
 * @returns {number} The setInterval id

 *
 */
async function animate(drivers, interval = 10, previousInterval) {
  if (previousInterval) {
    clearInterval(previousInterval);
  }

  return setInterval(async () => {
    const driverId = Math.floor(Math.random() * 1e4) % drivers.length;
    const driver = drivers[driverId];

    if (driver.untrustworthy && Date.now() < driver.untrustworthy.nextMessageDate.getTime()) {
      return;
    } else if (driver.untrustworthy) {
      driver.untrustworthy.nextMessageDate = getNextUntrustworthyMessageDate();
    }

    // Update the driver state
    driver.state = Math.random() > 0.8 ? 'ride' : 'available';
    driver.position = [
      driver.position[0] + 2e-1 * (driver.final[0] - driver.position[0]) + 1e-3 * (Math.random() - 0.5) * 2,
      driver.position[1] + 2e-1 * (driver.final[1] - driver.position[1]) + 1e-3 * (Math.random() - 0.5) * 2
    ];

    drivers[driverId] = driver;

    publish({
      id: driver.id,
      state: driver.state,
      position: driver.position
    });
  }, interval);
}

/**
 * Publish the updated state to the exchange
 *
 * @param {object} state
 * @returns {void}
 */
function publish(state) {
  client.channel.publish(EXCHANGE, ROUTING_KEY, Buffer.from(JSON.stringify(state)), {
    persistent: false,
    expiration: 10000 // ms
  });
}


/**
 * Output the current drivers list as a valid GeoJSON object feature.
 * @param {array} [drivers=[]] List of drivers to display
 * @returns {void}
 */
async function output(drivers = []) {
  const output = [];
  for (const driver of drivers) {
    output.push({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Point',
        coordinates: [driver.position[1], driver.position[0]]
      }
    });
  }

  console.log(JSON.stringify({
    type: 'FeatureCollection',
    features: output
  }));
}

/**
 * Main function of the script
 * @param {number} n Number of drivers to start
 * @param {number} [growth=1000] Time interval (ms) before increasing the messages rate
 * @param {number} [untrustworthyDriversRatio=0.0] The ratio of drivers
 *                 that will not send messages at every tick
 * @returns {void}
 */
async function main(n, growth = 1000, untrustworthyDriversRatio = 0.0) {
  logger.info('> Drivers initialization...');
  const drivers = await init(n, untrustworthyDriversRatio);

  // Output the drivers at start
  // await output(drivers);
  // return;

  let animateInterval;
  for (let i = 1000; i > 0.5; i /= 2) {
    logger.info({ rate: (1000 / i).toFixed(0) }, 'Drivers animation at rate');
    animateInterval = await animate(drivers, i, animateInterval);
    await new Promise(resolve => setTimeout(resolve, growth));
  }

  // Time to wait before outputing the drivers positions:
  await new Promise(resolve => setTimeout(resolve, 60 * 1000));
  // await output(drivers);

  await new Promise(resolve => setTimeout(resolve, 1e9));

  logger.info({ drivers }, 'Drivers');
}

main(process.env.N, process.env.GROWTH, process.env.UNTRUSTWORTHY_DRIVERS_RATIO)
  .then(() => {
    logger.info('> Worker stopped');
    process.exit(0);
  }).catch(err => {
  logger.error({ err }, '! Worker stopped unexpectedly');
  process.exit(1);
});
