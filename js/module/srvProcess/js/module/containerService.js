class Service {
    constructor(name, importance) {
        this._name = name;
        this._importance = importance;
    }
    #_object;
    get object() {
        return this.#_object;
    }

    set object(_obj) {
        this.#_object = _obj;
    }
}

class Services {
    constructor() {
        this._collection = [];
    }
    Init() {
        let arr = this.GetServices();
        let numServices = arr.length;
        
        for (let i = 0; i < numServices; i++) {
            this._collection[i] = new Service(arr[i].name, arr[i].importance);
        }
    }
    GetServices() {
        let arr = [
            {name: "Process", importance: "Critical"},
            {name: "WSClient", importance: "Critical"},
            {name: "Logger", importance: "Critical"},
            {name: "SystemBus", importance: "Critical"},
            {name: "LoggerBus", importance: "Critical"},
        ];
        return arr;
    }
    SetServiceObject(_name, _obj) {
        let index = this._collection.findIndex((element) => element._name == _name);

        if (index != -1) {
            this._collection[index].object = _obj;
        }

        console.log(this._collection[index].object);
    }
    GetServiceObject(_name) {
        let index = this._collection.findIndex((element) => element._name == _name);

        if (index != -1) {
            return this._collection[index].object;
        }
        else {
            return undefined;
        }
    }
}

module.exports = Services;