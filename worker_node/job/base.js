
class Base {
  #config;
  #output;

  constructor(config, requiredProps) {
    this.#config = config;
    this.#output = null;
    this.validateConfig(requiredProps);
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

  validateConfig(requiredProps) {
    for (const prop of requiredProps) {
      if (!Object.keys(this.#config).includes(prop)) {
        throw Error(`Need ${prop} property`);
      }
    }
  }

}

module.exports = Base;
