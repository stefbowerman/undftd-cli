const RateLimiter = require('limiter').RateLimiter
const Shopify = require('shopify-api-node');
const inquirer = require('inquirer');
const csv = require('csvtojson');
const chalk = require('chalk');
const helpers = require('./helpers').helpers;

// Classes to help us organize
const Entry = require('./models/entry').Entry;
const Customer = require('./models/customer').Customer;

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

// Set the variant ID that we're using for these draft orders
const variantId = 6865994874914

const defaultHeaders = ["EMAIL","IP","LOCATION","SHORT URL","DATE","INITIAL ENTRY","DAILY ENTRIES"," REFERRAL ENTRIES","BONUS ENTRIES","TOTAL ENTRIES","FIRST_NAME", "LAST_NAME","ADDRESS","CITY","STATE","ZIP","STYLE","SIZE","RESIDENT","I CONFIRM I LIVE IN CALIFORNIA  NEVADA OR ARIZONA AND WILL HAVE THE PRODUCT SHIPPED THE ADDRESS LISTED ABOVE.","AGREE_TO_RULES","ENTRY SOURCE","TOTAL REFERRALS","REFERRED BY","REFERRER SOURCE URL","ENTRY SOURCE URL","TRACKING CAMPAIGN NAME"];

const customerQueue = []

// Async removeTokens function
function removeTokens(count, limiter) {
  return new Promise((resolve, reject) => {
    limiter.removeTokens(count, (err, remainingRequests) => {
      if (err) return reject(err)
      resolve(remainingRequests)
    })
  })
}


// @TODO
// Before anything, double check that the product exists on Shopify?

function processEntries(entries = []) {
  console.log(`${chalk.gray('Total entries found =')} ${chalk.green(entries.length)}`)

  const entriesProcessed = []
  const entriesFailed = []
  const customerQueue = []

  inquirer
    .prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `${entries.length} ${entries.length == 1 ? 'entry' : 'entries'} found in total.  Continue?`
      }
    ])
    .then(async (answers) => {
      if (answers.confirm === false) {
        return;
      }

      for (const entry of entries) {
        // console.log(`${chalk.gray('Found entry for...')}${chalk.green(entry.email)}`)

        await removeTokens(1, limiter) // Wait for out limiter to let us proceed
 
        try {
          const customer = await findOrCreateShopifyCustomer(entry);
          console.log('successful try block')
          console.log(customer)
          // console.log(`${chalk.gray('New We have a customer to work with...')}${chalk.green(customer.id)}`)
          customerQueue.push(customer)
          entriesProcessed.push(customer);
        } catch(e) {
          console.log('something went wrong');
          console.log(e)
          entriesFailed(entry.email)
        }
      }

      console.log(`${chalk.gray('Total number of entries processed: ')} ${chalk.green(entriesProcessed.length)}`)

      if (entriesProcessed.length !== entries.length) {
        console.log('missed a couple')
        console.log(entriesFailed)
        // @TODO - output failures to CSV
        return;
      }

      // At this point, we've created an array of valid shopifyCustomers (customerQueue)

      console.log(`${chalk.gray('Valid Shopify Customers: ')} ${chalk.green(customerQueue.length)}`)
    })
    .catch(error => {
      if(error.isTtyError) {
        // Prompt couldn't be rendered in the current environment
      } else {
        // Something else when wrong
      }
    });
}

async function findOrCreateShopifyCustomer(entry) {
  return new Promise(function(resolve, reject) {
    
    function done(shopifyCustomer) {
      console.log(`${chalk.magenta('complete!')}`)
      resolve(new Customer({
        id: shopifyCustomer.id,
        email: shopifyCustomer.email,
        shippingAddress: entry.shopifyFormattedAddress
      }))
    }

    searchForCustomerByEmail(entry.email, shopifyCustomer => {
      console.log(`${chalk.green(entry.email)} customer found: ${shopifyCustomer.id}`);
      done(shopifyCustomer)
    }, () => {
      console.log(`${chalk.red(entry.email)} does not exist - need to make a new customer`)
      shopify.customer.create({
        "first_name": entry.firstName,
        "last_name": entry.lastName,
        "email": entry.email,
        "tags": "CLI-TEST"
      }, e => console.log(e))
        .then(done)
    })
  })
}

function searchForCustomerByEmail(email, foundCB = (shopifyCustomer) => {}, notfoundCB = () => {}) {
  shopify.customer.search({
    query: `email:${email.trim()}`
  })
    .then(customers => {
      if (customers.length != 1) {
        notfoundCB()
      }
      else {
        foundCB(customers[0])
      }
    })  
}

class App {
  constructor({ productId = null, variantIdMap = {}, csvFilePath}) {
    this.productId = productId
    this.variantIdMap = variantIdMap
    this.csvFilePath = csvFilePath

    console.log(chalk.bgGreen.black('👟 UNDFTD CLI 👟'))

    // Step 0
    this.checkProductAvailability()
      .then(success => {
        inquirer
          .prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Availability check successful.  Continue?`
            }
          ])
          .then(answers => {
            if (answers.confirm === false) {
              return;
            }

            // Step 1
            this.processEntries();
          })  
      }, error => {
        console.log(error)
        console.log('Exiting....')
      })
  }

  checkProductAvailability() {
    return new Promise(async (resolve, reject) => {
      console.log(`${chalk.gray('Checking for product availability...')}`)

      try {
        const product = await shopify.product.get(this.productId)
        console.log(`Product found: ${chalk.green(product.title)} - ${product.id}`)
        console.log(`Total quantity available: ${chalk.green(product.variants.reduce(( acc, variant ) => acc + variant.inventory_quantity, 0))}`)
        console.log(`${chalk.gray('Checking variant map...')}`)

        const sizeOptionIndex = product.options.findIndex(option => option.name.toLowerCase() === 'size')
        let validationFlag = true

        if (sizeOptionIndex !== undefined) {
          product.variants.forEach(variant => {
            const size = variant[`option${sizeOptionIndex+1}`]
            const found = this.variantIdMap.hasOwnProperty(size)
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

  processEntries() {
    // Process CSV
    console.log(`${chalk.gray('Processing file')} ${this.csvFilePath}`)

    csv({
      headers: defaultHeaders.map(header => helpers.camelize(header.replace('_', ' ').toLowerCase()))
    })
      .fromFile(this.csvFilePath)
      .then((data) => {
        const entries = data.map((e) => new Entry(e));
        processEntries(entries)

        // Create shopifyCustomers
        // Create and attach addresses
        // Create draft orders
      })    
  }
}


return new App({
  productId: 4490351640610,
  // Map of size -> variant ID
  variantIdMap: {
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
  },
  csvFilePath: './entries-sample.csv'
})
