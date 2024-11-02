// TODO: определиться где импорт происходит
const { MongoClient } = require('mongodb'); // импорт модуля для работы с MongoDB
const ClassBaseService_S = require('srvService'); //импорт модуля базового класса служб фреймворка

const DB_NAME = 'dbFramework2'; //'dbFramework1'
const ACCOUNT_USER_NAME = 'operator2'; //'operator2'
const ACCOUNT_PASSWORD = '34pass'; // pass12
//const CONNECTION_MDB_STR = `mongodb://${ACCOUNT_USER_NAME}:${ACCOUNT_PASSWORD}@127.0.0.1:27017/${DB_NAME}`; // строка подключения к СУБД MongoDB
const OPTION_MDB = { connectTimeoutMS: 3000, socketTimeoutMS: 3000, serverSelectionTimeoutMS: 3000 }; // таймаут подключения в миллисекундах
const CONNECTION_MDB_STR = `mongodb://${ACCOUNT_USER_NAME}:${ACCOUNT_PASSWORD}@192.168.1.251:27017/${DB_NAME}`; // строка подключения к СУБД MongoDB

const NAME_SERVICES = ['proc', 'logger', 'dm']; // список служб с которыми ожидается взаимодействие

// Константа предназначена для удобного задания полей массива 'source', которые в итоге будут
// переданы службе которая их запросила
const SOURCES_FIELDS_1 = {
  // описание полей в нотации MongoDB, указанные поля будут в итоговом массиве
  ID: '$$source.ID',
  Status: '$$source.Status',
  Name: '$$source.Name',
  OriginName: '$$source.OriginName',
  Type: '$$source.Type',
  Property: '$$source.Property',
  Protocol: '$$source.Protocol',
  DN: '$$source.DN',
  IP: '$$source.IP',
  Port: '$$source.Port',
  MAC: '$$source.MAC',
  IndexSource: '$$source.IndexSource',
  Login: '$$source.Login',
  Password: '$$source.Password',
  SensorChFactual: '$$source.SensorChFactual',
  SensorChExpected: '$$source.SensorChExpected',
  ActuatorChFactual: '$$source.ActuatorChFactual',
  ActuatorChExpected: '$$source.ActuatorChExpected',
  IsConnected: '$$source.IsConnected',
  CheckProcess: '$$source.CheckProcess',
  CheckClient: '$$source.CheckClient',
  CheckDM: '$$source.CheckDM',
  Description: '$$source.Description',
};
// Константа предназначена для удобного задания полей массива 'source', которые будут
// выведены на печать в консоль в табличном виде
const SOURCES_FIELDS_2 = {
  //ID: '$$source.ID',
  Status: '$$source.Status',
  Name: '$$source.Name',
  OriginName: '$$source.OriginName',
  Type: '$$source.Type',
  Property: '$$source.Property',
  Protocol: '$$source.Protocol',
  DN: '$$source.DN',
  IP: '$$source.IP',
  //Port: '$$source.Port',
  MAC: '$$source.MAC',
  //IndexSource: '$$source.IndexSource',
  //Login: '$$source.Login',
  //Password: '$$source.Password',
  SensorChExpected: '$$source.SensorChExpected',
  //SensorChFactual: '$$source.SensorChFactual',
  ActuatorChExpected: '$$source.ActuatorChExpected',
  //ActuatorChFactual: '$$source.ActuatorChFactual',
  //IsConnected: '$$source.IsConnected',
  //CheckProcess: '$$source.CheckProcess',
  //CheckClient: '$$source.CheckClient',
  //CheckDM: '$$source.CheckDM',
  //Description: '$$source.Description',
};

// Константа предназначена для удобного задания полей массива 'service', которые в итоге будут
// переданы службе которая их запросила
const SERVICES_FIELDS_1 = {
  Name: '$$serv.Name',
  Service: '$$serv.Service',
  Importance: '$$serv.Importance',
  InitOrder: '$$serv.InitOrder',
  Protocol: '$$serv.Protocol',
  PrimaryBus: '$$serv.PrimaryBus',
  BusList: '$$serv.BusList',
  EventList: '$$serv.EventList',
  Dependency: '$$serv.Dependency',
  ErrorMsg: '$$serv.ErrorMsg',
  Status: '$$serv.Status',
  Description: '$$serv.Description',
};
// Константа предназначена для удобного задания полей массива 'service',
// выведены на печать в консоль в табличном виде
const SERVICES_FIELDS_2 = {
  Name: '$$serv.Name',
  Service: '$$serv.Service',
  //Importance: '$$serv.Importance',
  //InitOrder: '$$serv.InitOrder',
  //Protocol: '$$serv.Protocol',
  //PrimaryBus: '$$serv.PrimaryBus',
  //BusList: '$$serv.BusList',
  EventList: '$$serv.EventList',
  Dependency: '$$serv.Dependency',
  //ErrorMsg: '$$serv.ErrorMsg',
  //Status: '$$serv.Status',
  //Description: '$$serv.Description',
};

/**
 * @class
 * @description Класс реализует функционал системной службы предназначенной для обеспечения
 * взаимодействия всех иных служб фреймворка с базой данной MongoDB.
 * В задачи и полномочия класса входит выполнение поручений других служб фреймворка по
 * извлечению и записи данных из/в соответствующих  коллекций БД MongoDB.
 * При этом осуществляется трансформация команд поступающих к объекту класса. Это означает,
 * что именно методы класса реализуют бизнес-логику взаимодействия сторонних служб и БД.
 * Взаимодействие элементов класса с другими серверными компонентами фреймворка осуществляется
 * посредством шин фреймворка.
 */
class ClassProviderMDB_S extends ClassBaseService_S {
  /** БЛОК ОБЪЯВЛЕНИЯ СТАТИЧЕСКИХ КОНСТАНТ КЛАССА ************************************************************/
  /**
   * @static
   * @constant {Array} EVENT_ON_LIST_SYSBUS
   * @description список событий, которые которые служба обрабатывает по шине 'sysBus'.
   * 'providermdb-get-config-system'    - чтение из БД конфигурации, всю которая требуется для старта системы;
   * 'providermdb-get-config-services'  - чтение из БД конфигурации системных служб;
   * 'providermdb-get-config-source'    - чтение из БД конфигурации источников данных;
   * 'providermdb-channels-get'         - чтение из БД конфигурации каналов сенсоров/актуаторов;
   * 'providermdb-device-config-get'    - чтение из БД конфигурации устройств (справочные данные сенсоров/актуаторов);
   * 'providermdb-set-config-system'    - запись в БД системных данных;
   * 'providermdb-set-config-services'  - запись в БД конфигурации системных служб;
   * 'providermdb-set-config-source'    - запись в БД конфигурации источников данных;
   * 'providermdb-channels-set'         - запись из БД конфигурации каналов сенсоров/актуаторов;
   * 'providermdb-device-config-set'    - запись из БД конфигурации устройств (справочные данные сенсоров/актуаторов);
   * 'all-init-stage0-set'              - в части набора данных эквивалентна 'providermdb-get-config-system'
   * 'all-init-stage1-set'      - инициализации службы + чтение из БД содержимого системных объектов 'SourceState' и 'ServicesState';
   */
  static EVENT_ON_LIST_SYSBUS = [
    'providermdb-config-system-get',
    'providermdb-config-services-get',
    'providermdb-config-source-get',
    'providermdb-channels-get',
    'providermdb-device-config-get',
    'providermdb-config-system-set',
    'providermdb-config-services-set',
    'providermdb-config-source-set',
    'providermdb-channels-set',
    'providermdb-device-config-set',
    'all-init-stage0-set',
    'all-init-stage1-set',
  ];
  /**
   * @static
   * @constant {Array} EVENT_ON_LIST_MDBBUS
   * @description список событий, которые которые служба обрабатывает по шине 'mdbBus'.
   * 'providermdb-get-data-raw'  - чтение из БД 'сырых' данных измерительных каналов из коллекции 'rawData';
   * 'providermdb-get-config-channel' - чтение конфигурации измерительных каналов из коллекции 'configChannel';
   * 'providermdb-set-data-raw'  - запись в  'сырых' измерительных в коллекцию 'rawData';
   * 'providermdb-set-data-work' - запись в БД 'рабочих' данных измерительных каналов в коллекцию '';
   *
   */
  static EVENT_ON_LIST_MDBBUS = [
    'providermdb-config-channel-get',
    'providermdb-data-raw-get',
    'providermdb-data-raw-set',
    'providermdb-data-work-set',
  ];
  /**
   * @static
   * @constant {Array} EVENT_ON_LIST_LOGBUS
   * @description список событий, которые которые служба обрабатывает по шине 'logBus'.
   *
   */
  static EVENT_ON_LIST_LOGBUS = [];
  /**
   * @static
   * @constant {Array} EVENT_ON_LIST_DATABUS
   * @description список событий, которые которые служба обрабатывает по шине 'dataBus'.
   *
   */
  static EVENT_ON_LIST_DATABUS = [];

  static EVENT_EMIT_PROC_LIST = [
    'proc-config-system-get',
    'proc-config-services-get',
    'proc-config-source-get',
  ];
  static EVENT_EMIT_LOGGER_LIST = [];
  static EVENT_EMIT_PROXYWSС_LIST = [];
  static EVENT_EMIT_DM_LIST = [];
  static EVENT_EMIT_SENSOR_LIST = [];
  static EVENT_EMIT_ACTUATOR_LIST = [];

  /** БЛОК ОБЪЯВЛЕНИЯ СТАТИЧЕСКИХ ПОЛЕЙ КЛАССА *************************************************************/

  /** БЛОК ОБЪЯВЛЕНИЯ ЗАКРЫТЫХ ПОЛЕЙ ***********************************************************************/
  #_Name = 'providermdb'; // имя службы провайдера DB
  //TODO:  потребуется внести изменения, так как в конечном итоге ИМЯ будет задаваться как аргумент
  //при создании службы

  // контейнер системных объектов-шин
  #_BusesList = {
    sysBus: null /* шина системная                          - используется службой */,
    mdbBus: null /* шина передачи данных в/из СУБД MongoDB  - используется службой */,
    logBus: null /* шина логирования                        - используется службой */,
    dataBus: null /* шина передачи прикладных данных  - не используется службой */,
  };
  #_ServicesState = null;
  #_HandlerFunc = {}; // хранит значения: 'топик события/функция обработчик'
  #_EmitFunc = {}; // хранит значения: 'топик события/функция эмиттер'
  #_ClientMDB = null; // коннект к СУБД MongoDB
  #_DB = null; // объект БД
  // TODO: проверить следующую строку
  //#_NameServices = ["proc", "logger", "proxywsс", "dm"]; // список служб с которыми ожидается взаимодействие

  /**
   * @constructor
   * @param {Object} _busesList - объект-контейнер хранящий все системные шины
   * @description конструктор класса инициирует выполняет следующие действия:
   *  - выполняет подключение к требуемым шинам фреймворка;
   *  - сохраняет линки на шины в полях объекта службы;
   *  - подписывается на все статические события с которыми будет работать служба;
   */
  constructor(_busesList) {
    // сохранить все основные системные шины в контейнере службы
    this.#AddUsedBus(_busesList);
    //TODO: заменить _busesList на глобальные объекты
    // инициализировать подписки на события на всех шинах с которыми работает служба
    this.#AddAggregateHandlerEvents();
    this.#PackHandlerFunc();
    this.#PackEmitFunc();
  }

  /** БЛОК ОБЪЯВЛЕНИЯ ЗАКРЫТЫХ МЕТОДОВ **********************************************************************/
  /**
   * @method
   * @description асинхронный метод инициирует соединение к СУБД MongoDB
   */
  async #ConnectToMDB(_connMDBStr = CONNECTION_MDB_STR, _optionMDB = OPTION_MDB) {
    try {
      this.#_ClientMDB = new MongoClient(_connMDBStr, _optionMDB); // инициализация коннекта к СУБД MongoDB
      await this.#_ClientMDB.connect(); // установить соединение к СУБД MongoDB
      this.#_DB = this.#_ClientMDB.db(); // инициализировать рабочую БД MongoDB

      /*debughome*/
      // TODO: сообщение заменить на работу со службой Logger
      console.log(`ProviderMDB | Успешно подключено к MongoDB!`);
      /*debugend*/
      return true; // вернуть успешный статус соединения
    } catch (error) {
      /*debughome*/
      // TODO: заменить на работу со службой Logger
      console.error(`ProviderMDB | Ошибка подключения к MongoDB: ${error}`);
      /*debugend*/
      return false; // вернуть отрицательный статус соединения
    }
  }
  /**
   * @method
   * @description асинхронный метод закрывает соединение к СУБД MongoDB
   */
  async #CloseConnectionMDB() {
    try {
      await this.#_ClientMDB.close();
      /*debughome*/
      // TODO: заменить на работу со службой Logger
      console.log(`ProviderMDB | Соединение с MongoDB закрыто.`);
      /*debugend*/
    } catch (error) {
      /*debughome*/
      // TODO: заменить на работу со службой Logger
      console.error(`ProviderMDB | Ошибка при закрытии соединения: ${error}`);
      /*debugend*/
    }
  }
  /**
   * @method
   * @private
   * @param {Object} _busesList - список шин в виде пар ключ/значение
   * @description Метод добавляет шины в контейнер '#_BusesList'
   */
  #AddUsedBus(_busesList) {
    // сохранить все основные системные шины в контейнере службы
    for (const name_bus in _busesList) {
      // проверить, существует ли ключ в #_BusList
      if (this.#_BusesList.hasOwnProperty(name_bus)) {
        this.#_BusesList[name_bus] = _busesList[name_bus]; // сохранить значение из '_busList' в  соответствующее поле '#_BusList'
      }
    }
  }
  /**
   * @method
   * @private
   * @description Метод выполняет упаковку обработчиков событий в один контейнер
   */
  #PackHandlerFunc() {
    // обработать список событий шины 'sysBus'
    ClassProviderMDB_S.EVENT_ON_LIST_SYSBUS.forEach((event) => {
      // Формируем имя обработчика, убирая префикс 'providermdb' и заменяя '-' на '_'
      const handlerName = `HandlerEvents_providermdb_${event.replace(/^providermdb-/, '').replace(/-/g, '_')}`;
      this.#_HandlerFunc[event] = this[handlerName]?.bind(this);
      // TODO: добавить проверку
    });
    ClassProviderMDB_S.EVENT_ON_LIST_SYSBUS.forEach((event) => {
      // Формируем имя обработчика, убирая префикс 'providermdb' и заменяя '-' на '_'
      const handlerName = `HandlerEvents_all_${event.replace(/^all-/, '').replace(/-/g, '_')}`;
      this.#_HandlerFunc[event] = this[handlerName]?.bind(this);
      // TODO: добавить проверку
    });
    // обработать список событий шины 'mdbBus'
    ClassProviderMDB_S.EVENT_ON_LIST_MDBBUS.forEach((event) => {
      // Формируем имя обработчика, убирая префикс 'providermdb' и заменяя '-' на '_'
      const handlerName = `HandlerEvents_providermdb_${event.replace(/^providermdb-/, '').replace(/-/g, '_')}`;
      this.#_HandlerFunc[event] = this[handlerName]?.bind(this);
    });
  }
  /**
   * @method
   * @private
   * @description Метод выполняет упаковку эмиттеров событий в один контейнер
   */
  #PackEmitFunc() {
    // обработать список эмиттеров событий службы 'proc'
    ClassProviderMDB_S.EVENT_EMIT_PROC_LIST.forEach((event) => {
      // Формируем имя эмиттера, убирая префикс 'providermdb' и заменяя '-' на '_'
      const emit_name = `EmitEvents_proc_${event.replace(/^proc-/, '').replace(/-/g, '_')}`;
      this.#_EmitFunc[event] = this[emit_name]?.bind(this);
    });
  }
  /**
   * @method
   * @private
   * @description добавляет агрегатный обработчик каждой из используемых шин
   */
  #AddAggregateHandlerEvents() {
    // инициировать агрегатный обработчик шины 'sysBus'
    ClassProviderMDB_S.EVENT_ON_LIST_SYSBUS.forEach((_topic) => {
      this.#_BusesList.sysBus.on(_topic, this.HandlerEventsSysBus.bind(this));
    });
    // инициировать агрегатный обработчик шины 'mdbBus'
    ClassProviderMDB_S.EVENT_ON_LIST_MDBBUS.forEach((_topic) => {
      this.#_BusesList.mdbBus.on(_topic, this.HandlerEventsMdbBus.bind(this));
    });
    // инициировать агрегатный обработчик шины 'logBus'
    ClassProviderMDB_S.EVENT_ON_LIST_LOGBUS.forEach((_topic) => {
      this.#_BusesList.logBus.on(_topic, this.HandlerEventsLogBus.bind(this));
    });
    // инициировать агрегатный обработчик шины 'dataBus'
    ClassProviderMDB_S.EVENT_ON_LIST_DATABUS.forEach((_topic) => {
      this.#_BusesList.dataBus.on(_topic, this.HandlerEventsDataBus.bind(this));
    });
  }
  /**
   * @method
   * @private
   * @param {string} _topic - топик события
   * @param {Object} _event - объект события
   * @description  Агрегатный обработчик событий шины 'sysBus'. Данный обработчик является точкой входа
   * при возникновении любого события на шине 'sysBus' на которые подписана данная служба
   */
  async HandlerEventsSysBus(_topic, _data) {
    this.#_HandlerFunc[_topic](_topic, _data);
  }
  /**
   * @method
   * @private
   * @param {string} _topic - топик события
   * @param {Object} _data - объект события
   * @description  агрегатный обработчик событий шины 'mdbBus'. Данный обработчик является точкой входа
   * при возникновении любого события на шине 'mdbBus' на которые подписана данная служба
   */
  async HandlerEventsMdbBus(_topic, _data) {}
  /**
   * @method
   * @private
   * @param {string} _topic - топик события
   * @param {Object} _data - объект события
   * @description  агрегатный обработчик событий шины 'logBus'. Данный обработчик является точкой входа
   * при возникновении любого события на шине 'logBus' на которые подписана данная служба
   */
  async HandlerEventsLogBus(_topic, _data) {}
  /**
   * @method
   * @private
   * @param {string} _topic - топик события
   * @param {Object} _data - объект события
   * @description  агрегатный обработчик событий шины 'dataBus'. Данный обработчик является точкой входа
   * при возникновении любого события на шине 'dataBus' на которые подписана данная служба
   */
  async HandlerEventsDataBus(_topic, _data) {}
  async HandlerEvents_providermdb_config_system_get(_topic, _data) {}
  async HandlerEvents_providermdb_config_services_get(_topic, _data) {}
  async HandlerEvents_providermdb_config_source_get(_topic, _data) {}
  async HandlerEvents_providermdb_config_channels_get(_topic, _data) {}
  async HandlerEvents_providermdb_config_devices_get(_topic, _data) {}

  async HandlerEvents_all_init_stage0_set(_topic, _data) {
    const resultConnect = await this.#ConnectToMDB(); // установить соединение с СУБД

    let collection = {}; // коллекция с которой выполняется работа
    let cursor = {}; // курсор соответствующий текущему запросу к БД
    let pipeline = []; // команды конвейера обработки

    // Запросить данные по 'Источникам'
    collection = this.#_DB.collection('projectData'); // выбрать коллекцию 'projectData'
    pipeline = [
      { $match: { status: 'active' } },
      { $unwind: '$sources' },
      { $match: { 'sources.Status': 'active' } },
      {
        $group: {
          _id: '$_id', // Группируем по _id документа
          sources: { $push: '$sources' }, // Собираем обратно массив sources
        },
      },
      {
        $project: {
          _id: 0, // Исключаем поле _id из результата
          sources: {
            $map: {
              input: '$sources', // Исходный массив sources
              as: 'source', // Переменная для каждого элемента
              in: SOURCES_FIELDS_2, // Создаем новый объект с нужными полями
            },
          },
        },
      },
    ];

    cursor = await collection.aggregate(pipeline);
    if (await cursor.hasNext()) {
      let sources_conf = await cursor.next(); //возвращает JSON объект с полем 'sources = [...]'
      sources_conf = sources_conf.sources;

      console.log('Запрошенная конфигурация Источников:');
      //console.table(sources_conf_lite); //возвращает JSON объект только с полем sources);
      console.table(sources_conf); //возвращает JSON объект только с полем sources);
    } else {
      console.log(`Обработчик события отработал. В БД нет данных по Источникам в запрошенной конфигурации !`);
    }

    // Запросить данные по 'Службам'
    collection = this.#_DB.collection('systemData'); // выбрать коллекцию 'systemData'
    pipeline = [
      { $match: { status: 'active' } },
      {
        $project: {
          _id: 0, // Исключаем поле _id из результата
          service: {
            $map: {
              input: '$service', // Исходный массив sources
              as: 'serv', // Переменная для каждого элемента
              in: SERVICES_FIELDS_2,
            },
          },
        },
      },
    ];
    cursor = await collection.aggregate(pipeline);
    //cursor = await collection.find({ status: 'active' }, { service: 1, _id: 0 });

    if (await cursor.hasNext()) {
      let service_conf = await cursor.next();
      service_conf = service_conf.service; //возвращает JSON объект с полем 'service = [...]'

      console.log('Запрошенная конфигурация Служб...:');
      console.table(service_conf); //возвращает JSON объект только с полем sources);
    } else {
      console.log(
        `Обработчик события: ${_topic}, отработал. В БД нет данных по службам в запрошенной конфигурации !`
      );
    }

    await this.#CloseConnectionMDB(); //закрыть соединение с БД
  }
  /**
   * @method
   * @public
   * @param {string} _topic  - топик события
   * @param {Object} _data - данные передаваемые в событии
   * и др системных объектов
   * @description Инициализация службы
   */
  async HandlerEvents_all_init_stage1_set(_topic, _data) {
    //TODO: удалить код данного метода как и сам метод. Его
    this.#_ServicesState = ServicesState; // сохранить контейнер служб со статусами
    this.#_ServicesState.SetServiceObject(this.#_Name, this); // сохранить ссылку на текущую службу в объекте 'Process'
    // TODO: аргументы необходимые при инициализации и вообще API уточнить у Голигрова Александра
  }
  async HandlerEvents_providermdb_config_system_set(_topic, _data) {}
  async HandlerEvents_providermdb_config_services_set(_topic, _data) {}
  async HandlerEvents_providermdb_config_source_set(_topic, _data) {}
  async HandlerEvents_providermdb_config_channels_set(_topic, _data) {}
  async HandlerEvents_providermdb_config_devices_set(_topic, _data) {}

  async EmitEvents_proc_config_system_get(_topic, _data) {}
  async EmitEvents_proc_config_services_get(_topic, _data) {}
  async EmitEvents_proc_config_source_get(_topic, _data) {}

  /** БЛОК ОБЪЯВЛЕНИЯ ОТКРЫТЫХ МЕТОДОВ **********************************************************************/
  /**
   * @method
   * @description метод возвращает имя текущей службы
   * @returns {string} - имя службы
   */
  GetNameService() {
    return this.#_Name;
  }
}
module.exports = ClassProviderMDB_S;
