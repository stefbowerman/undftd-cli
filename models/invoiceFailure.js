// 
class InvoiceFailure {
  static csvFields() {
    return  [
              {
                value: 'draftOrderId',
                label: 'Draft Order ID'
              },
              {
                value: 'draftOrderName',
                label: 'Draft Order Name'
              },                    
              {
                value: 'email',
                label: 'Email'
              },
              {
                value: 'errorName',
                label: 'Error Type'
              },
              {
                value: 'error',
                label: 'Error'
              }
            ]
  }

  constructor({ draftOrder, error }) {
    this.draftOrderId = draftOrder.id
    this.draftOrderName = draftOrder.name
    this.email = draftOrder.email
    this.errorName = error.name
    this.error = JSON.stringify(error); // So it can be output to a CSV if needed
  }
}

exports.InvoiceFailure = InvoiceFailure
