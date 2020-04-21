# 👟 Undefeated CLI 👟

Raffle Entry processing

- Process CSV, find all the emails
- ???  Check the address ??? Kick them out if they're not in CA?
- For each email, look up on shopify
- If they exist, push a custom object into the queue
- If they don't, create a new customer and then push the resulting object into the queue
- ??? What to do about addresses? ??
- Once we've collected all the emails in the queue, then start processing them and creating a draft order for each
- Output to a CSV?



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