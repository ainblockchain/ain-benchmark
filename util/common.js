class CommonUtil {
  static isBool(value) {
    return typeof value === 'boolean';
  }

  static toBool(value) {
    return CommonUtil.isBool(value) ? value : value === 'true';
  }
}

module.exports = CommonUtil;
