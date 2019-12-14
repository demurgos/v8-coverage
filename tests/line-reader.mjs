/**
 * Reads a string line by line.
 */
export class LineReader {
  constructor(text) {
    this.text = text;
    this.index = 0;
  }

  next() {
    if (this.index >= this.text.length) {
      return null;
    }
    const endIndex = this.text.indexOf("\n", this.index);
    let result;
    if (endIndex < 0) {
      result = this.text.substring(this.index);
      this.index = this.text.length;
    } else {
      result = this.text.substring(this.index, endIndex + 1);
      this.index = endIndex + 1;
    }
    return result;
  }

  peek() {
    if (this.index >= this.text.length) {
      return null;
    }
    const endIndex = this.text.indexOf("\n", this.index);
    if (endIndex < 0) {
      return this.text.substring(this.index);
    } else {
      return this.text.substring(this.index, endIndex + 1);
    }
  }
}
