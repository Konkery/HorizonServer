class ConnectionList {
    constructor() {
        this._MaxConnects = 25;
        this._DefaultName = 'unnamed';
    }
    Init(_bName, numConnects) {
        let res = [];
        let arr = ['192.168.50.71', '192.168.50.78', '192.168.50.86', '192.168.50.54'];
        let p = '8080';
        /*if (typeof numConnects !== 'number')
            numConnects = this._MaxConnects;
        if (numConnects > this._MaxConnects)
            numConnects = this._MaxConnects;
        if (numConnects < 0)
            numConnects = 1;

        _bName = _bName ? _bName : this._DefaultName;*/
        numConnects = arr.length;

        for (let i = 0; i < numConnects; i++){
            res[i] = {cName: arr[i], port: p};
        }

        return res;
    }
    FormObject(_arr) {
        //
        return {arr: _arr};
    }
}

module.exports = ConnectionList;