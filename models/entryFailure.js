// 
class EntryFailure {
  static csvFields() {
    return  [                   
              {
                value: 'email',
                label: 'Email'
              },
              {
                value: 'firstName',
                label: 'First Name'
              },
              {
                value: 'lastName',
                label: 'Last Name'
              }
            ]
  }

  constructor({ entry }) {
    this.email = entry.email
    this.firstName = entry.firstName
    this.lastName = entry.lastName
  }
}

exports.EntryFailure = EntryFailure
