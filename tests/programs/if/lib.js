module.exports = function lib (test) {
  if (test) {
    console.log('a')
  } else {
    console.log('b')
  }

  if (!test) {
    console.log('c')
  } else {
    console.log('d')
  }

  if (test) {
    console.log('e')
  }

  if (!test) {
    console.log('f')
  }
}
