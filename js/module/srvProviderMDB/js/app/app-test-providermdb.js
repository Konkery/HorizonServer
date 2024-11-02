const ClassProviderMDB = require('../module/srvProviderMDB.js');
const EventEmitter = require('eventemitter2');

// Объявление глобальных тестовых констант
const busList = {};
busList.sysBus = new EventEmitter();
busList.mdbBus = new EventEmitter();
busList.logBus = new EventEmitter();
busList.dataBus = new EventEmitter();

// Объект имитирует объекты-контейнеры, которые хранят статусную инф о службах и источниках.
// Также в объекте находится API для работы с внутренними записями о службах и источников
const statusList = {
  ServicesState: {
    SetServiceObject: function (_name, _obj) {
      let index = this._ServicesStateList.findIndex((element) => element.ServiceName == _name);
      if (index != -1) {
        this._ServicesStateList[index].object = _obj;
        this._ServicesStateList[index].Status = 'running';
      }
    },
    _ServicesStateList: [], // список с записями состояния служб
  },
  SourcesStatus: {
    _SourcesStatusList: [], // список источников
  },
};

// Тестовая инициализация записи службы 'providerMDB'
const recordProviderMDB = {
  ServiceName: 'providermdb', // содержит имя службы
  Service: {}, // содержит объект службы
  Importance: 'critical', // содержит уровень критичности 'critical' | 'optional'
  Error: '', //
  Status: 'stopped', // or 'running'
};
statusList.ServicesState._ServicesStateList.push(recordProviderMDB); // добавить тестовую конфигурацию службы providerMDB

// Инстанцирование класса службы 'providermdb'
const ProviderMDB = new ClassProviderMDB(busList);
// Генерация события 'init0'
busList.sysBus.emit('all-init-stage0-set', 'all-init-stage0-set', {
  message: 'Событие all-init-stage0-set возбуждено !',
});

setTimeout(() => {
  console.log('Jobs end!');
}, 1000);
