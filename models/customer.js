// All the data we need to create the draft order
class Customer {
  constructor({ id, shippingAddress }) {
    this.id = id
    this.shippingAddress = shippingAddress
  }

  get fields() {
    return ['id', 'shippingAddress']
  }
}

exports.Customer = Customer
