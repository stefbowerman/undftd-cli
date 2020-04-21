const Shopify = require('shopify-api-node');
const csv = require('csvtojson');
const chalk = require('chalk');
const helpers = require('./helpers').helpers;

console.log(chalk.bgGreen.black('👟 UNDFTD CLI 👟'))

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

// Set the variant ID that we're using for these draft orders
const variantId = 6865994874914

const filePath = './entries-sample.csv'

const defaultHeaders = ["EMAIL","IP","LOCATION","SHORT URL","DATE","INITIAL ENTRY","DAILY ENTRIES"," REFERRAL ENTRIES","BONUS ENTRIES","TOTAL ENTRIES","FIRST_NAME", "LAST_NAME","ADDRESS","CITY","STATE","ZIP","STYLE","SIZE","RESIDENT","I CONFIRM I LIVE IN CALIFORNIA  NEVADA OR ARIZONA AND WILL HAVE THE PRODUCT SHIPPED THE ADDRESS LISTED ABOVE.","AGREE_TO_RULES","ENTRY SOURCE","TOTAL REFERRALS","REFERRED BY","REFERRER SOURCE URL","ENTRY SOURCE URL","TRACKING CAMPAIGN NAME"];

console.log(`${chalk.gray('Processing file')} ${filePath}`)

csv({
  headers: defaultHeaders.map(header => helpers.camelize(header.toLowerCase()))
})
  .fromFile(filePath)
  .then(processEntries)

function processEntries(entries = []) {
  console.log(`${chalk.gray('Total entries found =')} ${chalk.green(entries.length)}`)

  entries.forEach(entry => {
    console.log(`${chalk.gray('Found entry for...')}${chalk.green(entry.email)}`)
    searchForCustomerByEmail(entry.email)
  })
}

function searchForCustomerByEmail(email) {
  shopify.customer.search({
    query: `email:${email.trim()}`
  })
    .then(customers => {
      if (customers.length != 1) {
        console.log(`${chalk.red(email)} does not exist - need to make a new customer`)
      }
      else {
        console.log(`${chalk.green(email)} customer found: ${customers[0].id}`);
      }
    })  
}

return;

const emails = [
  'stefbowerman@gmail.com'
  // ,
  // 'emailthatdoesnt@exist.com',
  // 'eric.liaw@undefeated.com'
]

emails.forEach((email) => {
  console.log(`searching for ${email} ...`)

  shopify.customer.search({
    query: `email:${email}`
  })
    .then(data => {
      if (data.length != 1) {
        console.log('need to make a new customer')
      }
      else {
        console.log(`found customer = ${data[0].id}`)

        shopify.draftOrder.create({
          line_items: [{
            "variant_id": variantId,
            quantity: 1
          }],
          "customer": {
            "id": data[0].id
          }
        })
          .then(order => {
            console.log(`created draft order ${order.name} for $${order.total_price}`);
          })
          .catch((err) => console.error(err));
      }
    })  
})
