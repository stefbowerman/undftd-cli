const fs = require('fs-extra')
const yargs = require('yargs')
const { RateLimiter } = require('limiter')
const Shopify = require('shopify-api-node')
const csv = require('csvtojson')
const { parse } = require('json2csv')
const chalk = require('chalk')
const ProgressBar = require('progress')
const { camelize } = require('./helpers/camelize')
const { askConfirmation } = require('./helpers/askConfirmation')

// Classes to help us organize data
const { Invoice } = require('./models/invoice');
const { InvoiceFailure } = require('./models/invoiceFailure');

// Handle scripts args
const args = yargs
  .option('filepath', {
    type: 'string',
    description: 'CSV filepath',
    demandOption: true
  })
  .option('dryrun', {
    type: 'boolean',
    description: 'Run without creating any objects inside Shopify'
  })
  .option('sku', {
    type: 'string',
    description: 'Run script for a specific product SKU'
  })
  .argv

let config

try {
  config = require('./config.json')
} catch (_) {}

const { shopName, apiKey, password } = config

if (!shopName || !apiKey || !password) {
  throw new Error(chalk.red('Shopify credentials are required to run this script.'))
}

// Create the Shopify client
const shopify = new Shopify({ shopName, apiKey, password });

// Create the limiter to make sure we don't max out Shopify API call limits
const limiter = new RateLimiter(4, 'second');

// Async removeTokens function
function removeTokens(count, limiter) {
  return new Promise((resolve, reject) => {
    limiter.removeTokens(count, (err, remainingRequests) => {
      if (err) return reject(err)
      resolve(remainingRequests)
    })
  })
}

// Config variables
const csvFilePath = args.filepath
const verbose = args.verbose
const dryrun = args.dryrun
const sku = args.sku
const timestamp = Date.now() // Use this so all files output from this script share a common timestamp
const outputDirectory = `./output/send-draft-order-invoices/`
const invoiceCustomMessage = 'Congratulations, you have been selected to purchase the Fear Of God 1 - Offnoir. You have 24-hours to complete your purchase, links to purchase expire after 24-hours.\n\nThank you,\nUndefeated Raffle Team'

async function main() {
  console.log(chalk.bgGreen.black('👟 UNDFTD CLI 👟'))

  if (dryrun) {
    console.log(chalk.gray('Running in dry mode..'))
  }

  // Check that we're on the right store
  try {
    const confirmed = await askConfirmation(`Script is running against the shop at ${chalk.inverse(shopify.options.shopName)}. Is this correct?`)

    if (!confirmed) {
      process.exit(1);
    }
  } catch(e) {
    process.exit(1);
  }

  if(sku != undefined) {
    try {
      const confirmed = await askConfirmation(`Running script for SKU ${chalk.green(sku)}.  Is this correct?`)

      if (!confirmed) {
        process.exit(1);
      }
    } catch(e) {
      process.exit(1);
    }
  }  

  // Turn the csv into an array of objects
  let draftOrders = []
  try {
    draftOrders = await processCSVIntoDraftOrderArray(csvFilePath)
  } catch(e) {
    process.exit(1);
  }

  if (dryrun) {
    console.log(`When not in dryrun mode, this script will attempt to send invoices for ${draftOrders.length} draft orders`);
    process.exit(1)
  }

  // Send invoices for each
  try {
    const { successes, failures } = await sendInvoicesForDraftOrders(draftOrders)

    if (successes.length) {
      console.log(`✅  Successfully sent ${chalk.inverse(successes.length)} invoices`)
    }
    else if (failures.length) {
      console.log(`⚠️  Failed to send ${chalk.inverse(failures.length)} invoices`)
    }

    // Output a csv for the invoices that sent successfully
    try {
      if (successes.length) {
        // Create the CSV
        const successesCSV = parse(successes, { fields: Invoice.csvFields() })
        const filepath = `${outputDirectory}invoices-sent${sku && `-${sku}`}-${timestamp}.csv`
        fs.outputFileSync(filepath, successesCSV)
        console.log(`${chalk.gray('List of sent invoices outputted to')} ${chalk.green(filepath)}`)
      }

      if (failures.length) {
        const failuresCSV = parse(failures, { fields: InvoiceFailure.csvFields() })
        const filepath = `${outputDirectory}invoices-failed${sku && `-${sku}`}-${timestamp}.csv`
        fs.outputFileSync(filepath, failuresCSV)
        console.log(`${chalk.gray('List of failed invoices outputted to')} ${chalk.red(filepath)}`)
      }
    } catch {
      // Just output them to the console?
      // console.log('CSV file creation failed, outputting as plain txt...')
      // @TODO draftOrders.map(order => `${order.name}, ${order.id}`).join('\n')
    }    
  } catch {
    process.exit(1);
  }
}

function processCSVIntoDraftOrderArray(filepath) {
  console.log(`${chalk.gray('Checking file')} ${filepath}`)
  const defaultHeaders = ["ID","Name","Email","Created At","Status"];

  return new Promise((resolve, reject) => {
    csv({
      headers: defaultHeaders.map(header => camelize(header.replace('_', ' ').toLowerCase()))
    })
      .fromFile(filepath)
      .then(data => {
        resolve(data)
      })
  })  
}

/*
  Returns a promise that resolves with an object containing 2 properties
  successes - array of Invoice objects
  failures - array of InvoiceFailure
*/
function sendInvoicesForDraftOrders(draftOrders) {
  const successes = []
  const failures = []
  const bar = new ProgressBar('Sending draft orders [:bar] :current/:total :percent :etas', {
    complete: '=',
    incomplete: ' ',
    head: '🚀',
    total: draftOrders.length,
    width: 80
  });

  return new Promise(async (resolve, reject) => {
    for (const draftOrder of draftOrders) {
      await removeTokens(1, limiter) // Wait for the limiter to tell us when we can hit the API

      try {
        const response = await shopify.draftOrder.sendInvoice(draftOrder.id, {
          "custom_message": invoiceCustomMessage
        });

        successes.push(new Invoice({
          draftOrderId: draftOrder.id,
          draftOrderName: draftOrder.name,
          to: response.to,
          subject: response.subject,
          customMessage: response.custom_message
        }));

        bar.tick()
      } catch(e) {
        failures.push(new InvoiceFailure({
          draftOrder,
          error: e
        }))
      }
    }

    resolve({ successes, failures })
  })
}

main()
