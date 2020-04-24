const inquirer = require('inquirer');

// Wrapper around inquirer for simple confirmations
function askConfirmation(message) {
  return new Promise((resolve, reject) => {
    inquirer
      .prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: message
        }
      ])
      .then(answers => {
        resolve(answers.confirm && true)
      })
  })
}

exports.askConfirmation = askConfirmation