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
  .option('sku', {
    type: 'string',
    description: 'Run script for a specific sku'
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
const sku = args.sku
const timestamp = Date.now() // Use this so all files output from this script share a common timestamp
const outputDirectory = `./output/viral-sweeps/`
const productId = 4423674232905

// Map of sku -> variant ID
const skuVariantMap = {
  'AR4237-005---4': 31373263372361,
  'AR4237-005---5': 31373263405129,
  'AR4237-005---6': 31373263437897,
  'AR4237-005---6.5': 31373263470665,
  'AR4237-005---7': 31373263503433,
  'AR4237-005---7.5': 31373263536201,
  'AR4237-005---8': 31373263601737,
  'AR4237-005---8.5': 31373263667273,
  'AR4237-005---9': 31373263765577,
  'AR4237-005---9.5': 31373263798345,
  'AR4237-005---10': 31373263863881,
  'AR4237-005---10.5': 31373263962185,
  'AR4237-005---11': 31373264060489,
  'AR4237-005---11.5': 31373264158793,
  'AR4237-005---12': 31373264257097,
  'AR4237-005---13': 31373264289865,
  'AR4237-005---14': 31373264322633
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
    product = await checkProductAvailability(productId, skuVariantMap)
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

  if(sku != undefined) {
    if(verbose) {
      try {
        const confirmed = await askConfirmation(`Running script for SKU ${chalk.green(sku)}.  Is this correct?`)

        if (!confirmed) {
          process.exit(1);
        }
      } catch(e) {
        process.exit(1);
      }
    }

    if(!skuVariantMap.hasOwnProperty(sku)) {
      console.log(chalk.red(`No variant found for SKU ${sku}`));
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

      const filepath = `${outputDirectory}draft-orders${sku && `-${sku}`}-${timestamp}.csv`
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

function checkProductAvailability(productId, skuVariantMap) {
  console.log(`${chalk.gray('Checking for product availability...')}`)

  return new Promise(async (resolve, reject) => {
    try {
      const product = await shopify.product.get(productId)
      product.total_quantity = product.variants.reduce(( acc, variant ) => acc + variant.inventory_quantity, 0)
      console.log(`Product found: ${chalk.green(product.title)} (${product.id})`)
      console.log(`Total quantity available: ${chalk.green(product.total_quantity)}`)
      
      verbose && console.log(`${chalk.gray('Checking sku variant map...')}`)

      const skusNotFound = []
      for (let [sku, variantId] of Object.entries(skuVariantMap)) {
        const variant = product.variants.find(variant => (variant.sku === sku && variant.id == variantId))

        if(!variant) {
          skusNotFound.push(sku)
        }

        verbose && console.log(`${chalk.gray('Checking SKU')} ${sku} ${variant ? `${chalk.green('Found')} ${chalk.grey(`- total inventory: ${variant.inventory_quantity}`)}` : chalk.red('No variant found for SKU')}`) 
      }

      skusNotFound.length == 0 ? resolve(product) : reject('Product setup is incomplete')
    } catch (e) {
      console.log(e)
    }      
  })
}

function processCSVIntoEntryArray(filepath) {
  const defaultHeaders = "EMAIL,FIRST_NAME,LAST_NAME,ADDRESS,CITY,STATE,ZIP,STYLE,SIZE".split(',')
  // const defaultHeaders = ["EMAIL","IP","LOCATION","SHORT URL","DATE","INITIAL ENTRY","DAILY ENTRIES"," REFERRAL ENTRIES","BONUS ENTRIES","TOTAL ENTRIES","FIRST_NAME", "LAST_NAME","ADDRESS","CITY","STATE","ZIP","STYLE","SIZE","RESIDENT","I CONFIRM I LIVE IN CALIFORNIA  NEVADA OR ARIZONA AND WILL HAVE THE PRODUCT SHIPPED THE ADDRESS LISTED ABOVE.","AGREE_TO_RULES","ENTRY SOURCE","TOTAL REFERRALS","REFERRED BY","REFERRER SOURCE URL","ENTRY SOURCE URL","TRACKING CAMPAIGN NAME"];

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
          variant_id: skuVariantMap[customer.size],
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
      })
        .then(done, (e) => console.log(e))
    })
  })
}

function searchForCustomerByEmail(email, foundCB = () => {}, notfoundCB = () => {}) {
  shopify.customer.search({
    query: `email:${email.trim()}`
  })
    .then(customers => {
      const c = customers.find(c => c.email.toLowerCase() === email.toLowerCase()) // Shopify can spit back multiple accounts for the same email email@address.com OR email+text@address.com
      c ? foundCB(c) : notfoundCB()
    })  
}

main()
