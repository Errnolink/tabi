var regedit = require('regedit')

var installPath = process.execPath

var keysToCreate = [
  'HKCU\\Software\\Classes\\Tabi',
  'HKCU\\Software\\Classes\\Tabi\\Application',
  'HKCU\\Software\\Classes\\Tabi\\DefaulIcon',
  'HKCU\\Software\\Classes\\Tabi\\shell\\open\\command',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Tabi\\Capabilities\\FileAssociations',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Tabi\\Capabilities\\StartMenu',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Tabi\\Capabilities\\URLAssociations',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Tabi\\DefaultIcon',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Tabi\\InstallInfo',
  'HKCU\\Software\\Clients\\StartMenuInternet\\Tabi\\shell\\open\\command'
]

var registryConfig = {
  'HKCU\\Software\\RegisteredApplications': {
    Tabi: {
      value: 'Software\\Clients\\StartMenuInternet\\Tabi\\Capabilities',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Classes\\Tabi': {
    default: {
      value: 'Tabi Browser Document',
      type: 'REG_DEFAULT'
    }
  },
  'HKCU\\Software\\Classes\\Tabi\\Application': {
    ApplicationIcon: {
      value: installPath + ',0',
      type: 'REG_SZ'
    },
    ApplicationName: {
      value: 'Tabi',
      type: 'REG_SZ'
    },
    AppUserModelId: {
      value: 'Tabi',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Classes\\Tabi\\DefaulIcon': {
    ApplicationIcon: {
      value: installPath + ',0',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Classes\\Tabi\\shell\\open\\command': {
    default: {
      value: '"' + installPath + '" "%1"',
      type: 'REG_DEFAULT'
    }
  },
  'HKCU\\Software\\Classes\\.htm\\OpenWithProgIds': {
    Tabi: {
      value: 'Empty',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Classes\\.html\\OpenWithProgIds': {
    Tabi: {
      value: 'Empty',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Tabi\\Capabilities\\FileAssociations': {
    '.htm': {
      value: 'Tabi',
      type: 'REG_SZ'
    },
    '.html': {
      value: 'Tabi',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Tabi\\Capabilities\\StartMenu': {
    StartMenuInternet: {
      value: 'Tabi',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Tabi\\Capabilities\\URLAssociations': {
    http: {
      value: 'Tabi',
      type: 'REG_SZ'
    },
    https: {
      value: 'Tabi',
      type: 'REG_SZ'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Tabi\\DefaultIcon': {
    default: {
      value: installPath + ',0',
      type: 'REG_DEFAULT'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Tabi\\InstallInfo': {
    IconsVisible: {
      value: 1,
      type: 'REG_DWORD'
    }
  },
  'HKCU\\Software\\Clients\\StartMenuInternet\\Tabi\\shell\\open\\command': {
    default: {
      value: installPath,
      type: 'REG_DEFAULT'
    }
  }
}

var registryInstaller = {
  install: function () {
    return new Promise(function (resolve, reject) {
      regedit.createKey(keysToCreate, function (err) {
        regedit.putValue(registryConfig, function (err) {
          if (err) {
            reject()
          } else {
            resolve()
          }
        })
      })
    })
  }
}
