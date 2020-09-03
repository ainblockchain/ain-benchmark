
class Base {
  #config;
  #output;

  constructor(config) {
    this.#config = config;
    this.#output = null;
  }

  get config() {
    return this.#config;
  }

  get output() {
    return this.#output;
  }

  set output(output) {
    this.#output = output;
  }

  async process() {
    throw Error('Need to implement process()');
  }

}

module.exports = Base;
