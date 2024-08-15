// TODO: определиться где импорт происходит
const { MongoClient } = require("mongodb"); // импорт модуля для работы с MongoDB

const DB_NAME = "dbFramework1";
const ACCOUNT_USER_NAME = "operator1";
const ACCOUNT_PASSWORD = "pass12";
const CONNECTION_MDB_STR = `mongodb://${ACCOUNT_USER_NAME}:${ACCOUNT_PASSWORD}@127.0.0.1:27017/${DB_NAME}`; // строка подключения к СУБД MongoDB

module.exports = () => {
  const x = undefined;
  /**
   * @class
   * @description класс реализует функционал системной службы предназначенной для обеспечения
   * взаимодействия всех иных служб фреймворка с базой данной MongoDB и ее коллекциями.
   * В задачи и полномочия класса входит выполнение поручений других служб фреймворка по
   * извлечению и записи данных из/в соответствующих  коллекций БД MongoDB.
   * При этом осуществляется трансформация команд поступающих к объекту класса. Это означает,
   * что именно методы класса реализуют бизнес-логику взаимодействия сторонних служб и БД.
   * Взаимодействие элементов класса с другими серверными компонентами фреймворка осуществляется
   * посредством двух шин: системной шины и шины передачи данных в/из СУБД MongoDB.
   */
  class ClassProviderMDB_S {
    // TODO: реализовать паттерн singleton. Обсудить с Никитой т.к. возможно его базовые классы служб
    // будут предоставлять данный механизм
    #_SystemBus; // системная шина
    #_MDBBus; // шина передачи данных в/из СУБД MongoDB
    #_DB = null; // объект БД в контексте подключения к СУБД MongoDB

    #_ClientMDB = null; // коннект к СУБД MongoDB

    /**
     * @constructor
     * @param {string} connMDBStr - строка подключения к БД MongoDB
     * @description конструктор класса инициирует соединение с СУБД MongoDB
     *
     */
    constructor(_connMDBStr = CONNECTION_MDB_STR) {
      this.#ConnectToMDB(_connMDBStr); // асинхронный метод инициирует соединение к СУБД
    }
    /**
     * @method
     * @description асинхронный метод инициирует соединение к СУБД MongoDB
     */
    async #ConnectToMDB(_connMDBStr) {
      try {
        this.#_ClientMDB = new MongoClient(_connMDBStr); // инициализация коннекта к СУБД MongoDB
        await this.#_ClientMDB.connect(); // установить соединение к СУБД MongoDB
        this.#_DB = this.#_ClientMDB.db(); // инициализировать поле объекта БД MongoDB

        /*debughome*/
        // TODO: заменить на работу со службой Logger
        console.log(`ProviderMDB |  | Успешно подключено к MongoDB!`);
        /*debugend*/
      } catch (error) {
        /*debughome*/
        // TODO: заменить на работу со службой Logger
        console.error(`ProviderMDB | Ошибка подключения к MongoDB: ${error}`);
        /*debugend*/
      }
    }
    /**
     * @method
     * @description асинхронный метод закрывает соединение к СУБД MongoDB
     */
    async #CloseConnectionMDB() {
      try {
        await this.client.close();
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
     * @param {object} SystemBus  - объект системной шины
     * @param {object} MDBBus     - объект шины передачи данных в/из СУБД MongoDB
     * @description Инициализация объекта класса
     */
    Init({ SystemBus, MDBBus }) {
      this.#_SystemBus = SystemBus; // инициализировать поле системной шины
      this.#_MDBBus = MDBBus; // инициализировать поле шины MongoDB

      // TODO:  добавить подписку на события от "живых" служб которые могут запросить данные из БД
    }
  }
};
