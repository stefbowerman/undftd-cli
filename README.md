# 👟 Undefeated CLI 👟

### Raffle Entry processing

- Process CSV
- Create a new `Entry` object for each row
- ???  Check the address ??? Kick them out if they're not in CA?
- For each entry, check shopify to see if the customer exists by email
- If they exist, push a customer object into the queue
- If they don't, create a new customer and then push the resulting object into the queue
- ??? What to do about addresses? ??
- Once we've collected all the emails in the queue, then start processing them and creating a draft order for each
- Output to a CSV?


##### 3 Step Process
###### Step 1
```
Create an array of Customer objects that are all valid Shopify customers
```

###### Step 3
```
Loop through all the customer objects and create a draft order for each one.
Capture the successes / failures with draft order IDs => output to CSV
```



End result

```javascript
const variantId = 123456789
const draftOrderQueue = [
  {
    "customer": {
      "id": "12345abcdef"
    }    
  },
  // ...
  {
    "customer": {
      "id": "abcdef12345"
    }    
  }
]

const line_items = [{
  "variant_id": variantId,
  "quantity": 1
}]

drafOrderQueue.forEach( customer => {
  shopify.draftOrder.create({ line_items, customer })
})
````