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

// Classes to help us organize
const { Customer } = require('./models/customer');
const { EntryFailure } = require('./models/entryFailure');

// Handle scripts args
const args = yargs
  .option('filepath', {
    type: 'string',
    description: 'CSV filepath',
    demandOption: true
  })
  // .option('dryrun', {
  //   type: 'boolean',
  //   description: 'Run without creating any objects inside Shopify'
  // })
  .option('size', {
    type: 'string',
    description: 'Run script for a specific size'
  })
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Run with verbose logging'
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
const size = args.size
const timestamp = Date.now() // Use this so all files output from this script share a common timestamp
const outputDirectory = `./output/viral-sweeps/`
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

  // Check that we're on the right store
  try {
    const confirmed = await askConfirmation(`Script is running against the shop at ${chalk.inverse(shopify.options.shopName)}. Is this correct?`)

    if (!confirmed) {
      process.exit(1);
    }
  } catch(e) {
    process.exit(1);
  }  

  // First check if the product is available and the mapping for it is correct
  let product

  try {
    product = await checkProductAvailability(productId, variantSizeMap)
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

  if(size != undefined) {
    if(verbose) {
      try {
        const confirmed = await askConfirmation(`Running script for size ${chalk.green(size)}.  Is this correct?`)

        if (!confirmed) {
          process.exit(1);
        }
      } catch(e) {
        process.exit(1);
      }
    }

    if(!variantSizeMap.hasOwnProperty(size)) {
      console.log(chalk.red(`No variant found for product in size ${size}`));
      process.exit(1)
    }
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

  // Now that we know how many entries we have, double check that we have enough product
  if (product.total_quantity < csvEntries.length) {
    try {
      const confirmed = await askConfirmation('There are more entries than product quantity available. Are you sure you want to continue?')

      if (!confirmed) {
        process.exit(1);
      }
    } catch(e) {
      process.exit(1);
    }
  }

  // Now we need to process each entry and turn it into a customer
  // Vars needs to be declared outside of the try/catch block because we need them in the next step
  let customers = []
  let failures = []

  try {
    const data = await processEntriesIntoCustomerArray(csvEntries)

    customers = data.successes
    failures = data.failures

    console.log(`Number of customers processed successfully: ${chalk.green(customers.length)}`);

    if (failures.length) {
      try {
        const failuresCSV = parse(failures, { fields: EntryFailure.csvFields() })
        const filepath = `${outputDirectory}entries-failed-${timestamp}.csv`
        fs.outputFileSync(filepath, failuresCSV)
        console.log(`${chalk.red(failures.length)} entries failed to load as customers in Shopify`);
        console.log(`${chalk.gray('List of entries failed to load as Shopify customers outputted to')} ${chalk.red(filepath)}`)
        process.exit(1);  
      } catch(e) {
        console.log(e)
      }
    }
  } catch {
    process.exit(1);
  }

  
  try {
    const confirmed = await askConfirmation(`You're about to create draft orders for ${customers.length} customers.  Are you sure you want to continue?`)

    if (!confirmed) {
      process.exit(1);
    }
  } catch(e) {
    process.exit(1);
  }  

  // Now that we have an array of customers, we can create draft orders for each
  try {
    const draftOrders = await createDraftOrdersForCustomerArray(customers)

    verbose && console.log(`Successfully created ${chalk.inverse(draftOrders.length)} draft orders`)

    // Create a CSV with all the orders
    try {
      const csv = parse(draftOrders, { fields: [
                    {
                      value: 'id',
                      label: 'ID'
                    },
                    {
                      value: 'name',
                      label: 'Name'
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

      const filepath = `${outputDirectory}draft-orders${size && `-size${size}`}-${timestamp}.csv`
      fs.outputFileSync(filepath, csv)
      console.log(`${chalk.gray('List of created draft orders outputted to')} ${chalk.green(filepath)}`)      
    } catch {
      // Just output them to the console?
      console.log('CSV file creation failed, outputting as plain txt...')
      // @TODO draftOrders.map(order => `${order.name}, ${order.id}`).join('\n')
    }
  } catch {

  }

  console.log(`✅  ${chalk.bgGreen.black('VIRAL SWEEP DRAFT ORDER CREATION COMPLETE')}  ✅`)
}

function checkProductAvailability(productId, variantSizeMap) {
  console.log(`${chalk.gray('Checking for product availability...')}`)

  return new Promise(async (resolve, reject) => {
    try {
      const product = await shopify.product.get(productId)
      product.total_quantity = product.variants.reduce(( acc, variant ) => acc + variant.inventory_quantity, 0)
      console.log(`Product found: ${chalk.green(product.title)} (${product.id})`)
      console.log(`Total quantity available: ${chalk.green(product.total_quantity)}`)
      
      verbose && console.log(`${chalk.gray('Checking variant map...')}`)

      const sizeOptionIndex = product.options.findIndex(option => option.name.toLowerCase() === 'size')
      let validationFlag = true

      if (sizeOptionIndex !== undefined) {
        product.variants.forEach(variant => {
          const size = variant[`option${sizeOptionIndex+1}`]
          const found = variantSizeMap.hasOwnProperty(size)
          if (!found) {
            validationFlag = false
          }
          
          verbose && console.log(`${chalk.gray('Checking size')} ${size} ${found ? /* chalk.green('Found')*/ '' : chalk.red('Size not found')}`)  
        })
      }

      validationFlag ? resolve(product) : reject('Product setup is incomplete')
    } catch (e) {
      console.log(e)
    }      
  })
}

function processCSVIntoEntryArray(filepath) {
  const defaultHeaders = ["EMAIL","IP","LOCATION","SHORT URL","DATE","INITIAL ENTRY","DAILY ENTRIES"," REFERRAL ENTRIES","BONUS ENTRIES","TOTAL ENTRIES","FIRST_NAME", "LAST_NAME","ADDRESS","CITY","STATE","ZIP","STYLE","SIZE","RESIDENT","I CONFIRM I LIVE IN CALIFORNIA  NEVADA OR ARIZONA AND WILL HAVE THE PRODUCT SHIPPED THE ADDRESS LISTED ABOVE.","AGREE_TO_RULES","ENTRY SOURCE","TOTAL REFERRALS","REFERRED BY","REFERRER SOURCE URL","ENTRY SOURCE URL","TRACKING CAMPAIGN NAME"];

  verbose && console.log(`${chalk.gray('Processing file')} ${filepath}`)  

  return new Promise((resolve, reject) => {
    csv({
      headers: defaultHeaders.map(header => camelize(header.replace('_', ' ').toLowerCase()))
    })
      .fromFile(filepath)
      .then(data => resolve(data))
  })
}

/*
  Returns a promise that resolves with an object containing 2 properties
  successes - array of Customer objects
  failures - array of EntryFailure objects
*/
function processEntriesIntoCustomerArray(entries = []) {
  const successes = []
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
      await removeTokens(1, limiter) // Wait for the limiter to tell us when we can hit the API

      try {
        const customer = await findOrCreateCustomer(entry);
        successes.push(customer)
        bar.tick()
      } catch(e) {
        failures.push(new EntryFailure({ entry }))
      }
    }

    resolve({ successes, failures })
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

      const params = {
        line_items: [{
          variant_id: variantSizeMap[customer.size], // @TODO - Need to handle case where this fails?  Or map all entries and do this check up front...
          quantity: 1
        }],
        customer: {
          id: customer.id
        },
        shipping_address: customer.formattedShippingAddress
      }
      
      const draftOrder = await shopify.draftOrder.create(params)

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
      verbose && console.log(`${chalk.red(entry.email)} does not exist - need to make a new customer`)

      shopify.customer.create({
        first_name: entry.firstName,
        last_name: entry.lastName,
        email: entry.email
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

main()
