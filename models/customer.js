const _MapFullNameAbbr = {"arizona":"AZ","alabama":"AL","alaska":"AK","arkansas":"AR","california":"CA","colorado":"CO","connecticut":"CT","districtofcolumbia":"DC","delaware":"DE","florida":"FL","georgia":"GA","hawaii":"HI","idaho":"ID","illinois":"IL","indiana":"IN","iowa":"IA","kansas":"KS","kentucky":"KY","louisiana":"LA","maine":"ME","maryland":"MD","massachusetts":"MA","michigan":"MI","minnesota":"MN","mississippi":"MS","missouri":"MO","montana":"MT","nebraska":"NE","nevada":"NV","newhampshire":"NH","newjersey":"NJ","newmexico":"NM","newyork":"NY","northcarolina":"NC","northdakota":"ND","ohio":"OH","oklahoma":"OK","oregon":"OR","pennsylvania":"PA","rhodeisland":"RI","southcarolina":"SC","southdakota":"SD","tennessee":"TN","texas":"TX","utah":"UT","vermont":"VT","virginia":"VA","washington":"WA","westvirginia":"WV","wisconsin":"WI","wyoming":"WY","alberta":"AB","britishcolumbia":"BC","manitoba":"MB","newbrunswick":"NB","newfoundland":"NF","northwestterritory":"NT","novascotia":"NS","nunavut":"NU","ontario":"ON","princeedwardisland":"PE","quebec":"QC","saskatchewan":"SK","yukon":"YT"}

// Overloaded shopify customer object with size && style preference
class Customer {
  constructor({ id, email, style, size, firstName, lastName, address, city, state, zip }) {
    // ID & email need to match record in Shopify
    this.id = id
    this.email = email

    this.firstName = firstName
    this.lastName = lastName
    this.address = address
    this.city = city
    this.state = state
    this.zip = zip

    this.country = 'United States of America'
    this.countryCode = 'US'

    this.style = style
    this.size = size
  }

  get stateCode() {
    const strInput = this.state.trim();

    if(strInput.length === 2) {
      // already abbr, check if it's valid
      const upStrInput = strInput.toUpperCase();
      return _MapAbbrFullName[upStrInput] ? upStrInput : undefined;
    }
    const strStateToFind = strInput.toLowerCase().replace(/\ /g, '');
    return _MapFullNameAbbr[strStateToFind];
  }

  // Returns an object meant for consumption by the Shopify API
  get formattedShippingAddress() {
    const address = {
      "first_name": this.firstName,
      "last_name": this.lastName,
      "name": `${this.firstName} ${this.lastName}`
    }

    if (this.address !== '') {
      address.address1 = this.address
      address.city = this.city
      province = this.state
      province_code = this.stateCode
      country = this.country
      zip = this.zip
      country_code = this.countryCode
      country_name = this.country
    }

    return address
  }
}

exports.Customer = Customer
