# 👟 Undefeated CLI 👟

Command line scripts for Undefeated.

### Scripts

#### `viralSweep.js`

Pass in a CSV export from Viralsweep and this will create draft orders for each entry.  You must edit the variant size map with the appropriate variants for each size found in the CSV.  Receipt of any objects created or errors will be output to the `/output` directory.

```
Options:
  --help         Show help                                             [boolean]
  --version      Show version number                                   [boolean]
  --filepath     CSV filepath                                [string] [required]
  --size         Run script for a specific product size                 [string]
  --verbose, -v  Run with verbose logging                              [boolean]
```

#### `sendDraftOrderInvoices.js`

Consumes a CSV output from the `viralSweep.js` script and sends an invoice for each draft order found.  Make sure to edit the `invoiceCustomMessage` variable inside the script which will be included inside the email.

```
Options:
  --help      Show help                                                [boolean]
  --version   Show version number                                      [boolean]
  --filepath  CSV filepath                                   [string] [required]
  --dryrun    Run without creating any objects inside Shopify          [boolean]
  --size      Run script for a specific product size                    [string]
```