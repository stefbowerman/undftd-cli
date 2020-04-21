// Class instance of a row in the CSV
// Wrapper used to add helper getter methods
class Entry {
  constructor({ email, style, size, firstName, lastName, address, city, state, zip }) {
    this.firstName = firstName
    this.lastName = lastName
    this.address = address
    this.city = city
    this.state = state
    this.zip = zip

    this.country = 'United States of America'
    this.countryCode = 'USA'

    this.email = email
    this.style = style
    this.size = size
  }

  get shopifyFormattedAddress() {
    return {
      "address1": this.address,
      // "address2": "",
      "city": this.city,
      //"company": "Fancy Co.",
      "first_name": this.firstName,
      "last_name": this.lastName,
      // "phone": "819-555-5555",
      "province": this.city,
      "country": this.country,
      "zip": this.zip,
      "name": `${this.firstName} ${this.lastName}`,
      // "province_code": "QC",
      "country_code": this.countryCode,
      "country_name": this.country
    }
  }  
}

exports.Entry = Entry