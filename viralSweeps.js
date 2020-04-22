const fs = require('fs-extra')
const { RateLimiter } = require('limiter')
const Shopify = require('shopify-api-node');
const inquirer = require('inquirer');
const csv = require('csvtojson');
const { parse } = require('json2csv');
const chalk = require('chalk');
const ProgressBar = require('progress');
const { helpers } = require('./helpers');

// Classes to help us organize
const { Customer } = require('./models/customer');

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
const csvFilePath = './entries-sample.csv'
const productId = 4490351640610

// Map of size -> variant ID
const variantSizeMap = {
  '4': 31881335734306,
  '5': 31881335767074,
  '6': 31881335799842,
  '6.5': 31881335832610,
  '7': 31881335865378,
  '7.5': 31881335898146,
  '8': 31881335930914,
  '8.5': 31881335963682,
  '9': 31881335996450,
  '9.5': 31881336029218,
  '10': 31881336061986,
  '10.5': 31881336094754,
  '11': 31881336127522,
  '11.5': 31881336160290,
  '12': 31881336193058,
  '13': 31881336225826,
  '14': 31881336258594
}

async function main() {
  console.log(chalk.bgGreen.black('👟 UNDFTD CLI 👟'))

  // First check if the product is available and the mapping for it is correct
  try {
    await checkProductAvailability(productId, variantSizeMap)
  } catch(e) {
    process.exit(1);
  }

  // Now that we've displayed this to the user, have them verify
  try {
    const confirmed = await askConfirmation('Availability check successful. Does this look correct?')

    if (!confirmed) {
      process.exit(1);
    }
  } catch(e) {
    process.exit(1);
  }

  // Now we need to turn the CSV into something usable
  let csvEntries = []
  try {
    csvEntries = await processCSVIntoEntryArray(csvFilePath)
    const confirmed = await askConfirmation(`${csvEntries.length} ${csvEntries.length == 1 ? 'entry' : 'entries'} found in total. Does this look correct?`)

    if (!confirmed) {
      process.exit(1);
    }    
  } catch(e) {
    process.exit(1);
  }

  // Now we need to process each entry and turn it into a customer
  // Vars needs to be declared outside of the try/catch block because we need them in the next step
  let customers = []
  let failures = []

  try {
    const data = await processEntriesIntoCustomerArray(csvEntries)

    customers = data.customers
    failures = data.failures

    // console.log(`Customers processed = ${customers.length}`)

    if (failures.length) {
      // @TODO Output these to a CSV?
    }
  } catch {
    process.exit(1);
  }

  // Now that we have an array of customers, we can create draft orders for each
  try {
    const draftOrders = await createDraftOrdersForCustomerArray(customers)

    // Create a CSV with all the orders
    try {
      const csv = parse(draftOrders, { fields: [
                    {
                      value: 'id',
                      label: 'ID'
                    },
                    {
                      value: 'name',
                      label: 'Draft Order #'
                    },
                    {
                      value: 'email',
                      label: 'Email'
                    },
                    {
                      value: 'created_at',
                      label: 'Created At'
                    },
                    {
                      value: 'status',
                      label: 'Status'
                    }
                  ]})

      const filepath = `output/viralSweeps-draftOrders-${Date.now()}.csv`
      fs.outputFileSync(filepath, csv)
      console.log(`${chalk.gray('List of created draft orders outputted to')} ${chalk.green(filepath)}`)      
    } catch {
      // Just output them to the console?
      console.log('CSV file creation failed, outputting as plain txt...')
      // @TODO draftOrders.map(order => `${order.name}, ${order.id}`).join('\n')
    }
  } catch {

  }
}

// Wrapper around inquirer for simple confirmations
function askConfirmation(message) {
  return new Promise((resolve, reject) => {
    inquirer
      .prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: message
        }
      ])
      .then(answers => {
        resolve(answers.confirm && true)
      })
  })
}

function checkProductAvailability(productId, variantSizeMap) {
  console.log(`${chalk.gray('Checking for product availability...')}`)

  return new Promise(async (resolve, reject) => {
    try {
      const product = await shopify.product.get(productId)
      console.log(`Product found: ${chalk.green(product.title)} - ${product.id}`)
      console.log(`Total quantity available: ${chalk.green(product.variants.reduce(( acc, variant ) => acc + variant.inventory_quantity, 0))}`)
      console.log(`${chalk.gray('Checking variant map...')}`)

      const sizeOptionIndex = product.options.findIndex(option => option.name.toLowerCase() === 'size')
      let validationFlag = true

      if (sizeOptionIndex !== undefined) {
        product.variants.forEach(variant => {
          const size = variant[`option${sizeOptionIndex+1}`]
          const found = variantSizeMap.hasOwnProperty(size)
          if (!found) {
            validationFlag = false
          }
          console.log(`${chalk.gray('Checking size')} ${size} ${found ? /* chalk.green('Found')*/ '' : chalk.red('Not Found')}`)
        })
      }

      validationFlag ? resolve() : reject('Product setup is incomplete')
    } catch (e) {
      console.log(e)
    }      
  })
}

function processCSVIntoEntryArray(filepath) {
  console.log(`${chalk.gray('Processing file')} ${filepath}`)
  const defaultHeaders = ["EMAIL","IP","LOCATION","SHORT URL","DATE","INITIAL ENTRY","DAILY ENTRIES"," REFERRAL ENTRIES","BONUS ENTRIES","TOTAL ENTRIES","FIRST_NAME", "LAST_NAME","ADDRESS","CITY","STATE","ZIP","STYLE","SIZE","RESIDENT","I CONFIRM I LIVE IN CALIFORNIA  NEVADA OR ARIZONA AND WILL HAVE THE PRODUCT SHIPPED THE ADDRESS LISTED ABOVE.","AGREE_TO_RULES","ENTRY SOURCE","TOTAL REFERRALS","REFERRED BY","REFERRER SOURCE URL","ENTRY SOURCE URL","TRACKING CAMPAIGN NAME"];

  return new Promise((resolve, reject) => {
    csv({
      headers: defaultHeaders.map(header => helpers.camelize(header.replace('_', ' ').toLowerCase()))
    })
      .fromFile(filepath)
      .then(data => {
        resolve(data)
      })
  })
}

function processEntriesIntoCustomerArray(entries = []) {
  const customers = []
  const failures = []
  const bar = new ProgressBar('Processing entries [:bar] :current/:total :percent :etas', {
    complete: '=',
    incomplete: ' ',
    head: '👟',
    total: entries.length,
    width: 80
  });

  return new Promise(async (resolve, reject) => {
    for (const entry of entries) {
      // console.log(`${chalk.gray('Found entry for...')}${chalk.green(entry.email)}`)

      await removeTokens(1, limiter) // Wait for the limiter to tell us when we can hit the API

      try {
        const customer = await findOrCreateCustomer(entry);
        // console.log(`${chalk.gray('New We have a customer to work with...')}${chalk.green(customer.id)}`)
        customers.push(customer)
        bar.tick()
      } catch(e) {
        console.log('something went wrong');
        console.log(e)
        failures.push(entry.email)
      }
    }

    resolve({ customers, failures })
  })
}

function createDraftOrdersForCustomerArray(customers = []) {
  const draftOrders = []
  const bar = new ProgressBar('Creating draft orders [:bar] :current/:total :percent :etas', {
    complete: '=',
    incomplete: ' ',
    head: '✏️',
    total: customers.length,
    width: 80
  });

  return new Promise(async (resolve, reject) => {
    for (const customer of customers) {
      await removeTokens(1, limiter) // Wait for the limiter to tell us when we can hit the API 
      
      const draftOrder = await shopify.draftOrder.create({
        line_items: [{
          variant_id: variantSizeMap[customer.size], // @TODO - Need to handle case where this fails?  Or map all entries and do this check up front...
          quantity: 1
        }],
        customer: {
          id: customer.id
        },
        shipping_address: customer.formattedShippingAddress
        // , note: 'ViralSweep entry'
      })

      draftOrders.push(draftOrder)
      bar.tick()
    }

    resolve(draftOrders)
  })
}

// Searches shopify for a customer, creates one if they don't exist
// Instantiates a Customer model that is an overloaded version of the shopify customer
// with size / product preference information
function findOrCreateCustomer(entry) {
  return new Promise(function(resolve, reject) {
    
    function done(shopifyCustomer) {
      const c = new Customer({
                      id: shopifyCustomer.id, // These are the only things we need from Shopify
                      email: shopifyCustomer.email, // These are the only things we need from Shopify
                      firstName: entry.firstName,
                      lastName: entry.lastName,
                      address: entry.address,
                      city: entry.city,
                      state: entry.state,
                      zip: entry.zip,
                      style: entry.style,
                      size: entry.size
                    })

      resolve(c)
    }

    searchForCustomerByEmail(entry.email, shopifyCustomer => { done(shopifyCustomer) }, () => {
      console.log(`${chalk.red(entry.email)} does not exist - need to make a new customer`)
      shopify.customer.create({
        "first_name": entry.firstName,
        "last_name": entry.lastName,
        "email": entry.email
        // ,"tags": "CLI-TEST"
      }, e => console.log(e))
        .then(done)
    })
  })
}

function searchForCustomerByEmail(email, foundCB = () => {}, notfoundCB = () => {}) {
  shopify.customer.search({
    query: `email:${email.trim()}`
  })
    .then(customers => {
      customers.length === 1 ? foundCB(customers[0]) : notfoundCB()
    })  
}

main();