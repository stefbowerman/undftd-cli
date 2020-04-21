// All the data we need to create the draft order
class Customer {
  constructor({ id, shippingAddress }) {
    this.id = id
    this.shippingAddress = shippingAddress
  }
}

exports.Customer = Customer
