// 
class Invoice {
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
                value: 'to',
                label: 'Sent To'
              }
            ]
  }  
  constructor({ draftOrderId, draftOrderName, to, subject, customMessage }) {
    this.draftOrderId = draftOrderId
    this.draftOrderName = draftOrderName
    this.to = to
    this.subject = subject
    this.customMessage = customMessage
  }
}

exports.Invoice = Invoice
