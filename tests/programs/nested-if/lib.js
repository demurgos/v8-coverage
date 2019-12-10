module.exports = function lib (a, b) {
  if (a) {
    if (b) {
      console.log('true, true')
    } else {
      console.log('true, false')
    }
  } else {
    if (b) {
      console.log('false, true')
    } else {
      console.log('false, false')
    }
  }
}
