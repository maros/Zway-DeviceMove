/*jshint -W058 */

function TimeoutManager(scope) {
    var self        = this;
    self.scope      = scope;
    self.timeouts   = {};
}
TimeoutManager.prototype.timeouts = {};
TimeoutManager.prototype.running  = function(id) {
    var self   = this;
    if (typeof(self.timeouts[id]) === "undefined") {
        return false;
    }
    return self.timeouts[id].cleared ? false:true;
};
TimeoutManager.prototype.add      = function(id,fn,interval) {
    var self   = this;

    // Do not overwrite existing timer
    if (typeof(self.timeouts[id]) !== "undefined"
        && self.timeouts[id].cleared === false) {
        throw('Timeout "'+id+'" is already active');
    }

    // Build args
    var args   = new Array(arguments.length - 1);
    for(var i = 0; i < args.length; ++i) {
        args[i] = arguments[i+1];
    }
    args.unshift(self.scope,self.scope);
    self.timeouts[id] = new(Function.prototype.bind.apply(Timeout,args));
    return self.timeouts[id];
};
TimeoutManager.prototype.replace  = function(id,fn,interval) {
    var self   = this;

    // Clear existing timer
    if (typeof(self.timeouts[id]) !== "undefined") {
        self.timeouts[id].clear();
    }

    // Build args
    var args   = new Array(arguments.length - 1);
    for(var i = 0; i < args.length; ++i) {
        args[i] = arguments[i+1];
    }
    args.unshift(self.scope,self.scope);
    self.timeouts[id] = new(Function.prototype.bind.apply(Timeout,args));
    return self.timeouts[id];
};
TimeoutManager.prototype.get    = function(id) {
    return this.timeouts[id];
};
TimeoutManager.prototype.clear    = function(id) {
    var self   = this;
    if (typeof(self.timeouts[id]) !== "undefined") {
        self.timeouts[id].clear();
        delete self.timeouts[id];
        return true;
    }
    return false;
};
TimeoutManager.prototype.clearAll = function() {
    var self   = this;
    for (var id in self.timeouts) {
        if (self.timeouts.hasOwnProperty(id)  
            && typeof(self.timeouts[id]) !== "undefined") {
            self.timeouts[id].clear();
        }
    }
    self.timeouts = {};
};


function Timeout(scope,fn,interval) {
    var self   = this;
    var args   = new Array(arguments.length-3);
    for(var i = 0; i < args.length; ++i) {
        args[i] = arguments[i+3];
    }
    args.unshift(scope);

    self.fn     = Function.prototype.bind.apply(fn,args);
    self.id     = setTimeout(self.run.bind(self),interval);
    self.cleared= false;
    //Register timeout by name?
}

Timeout.prototype.id       = undefined;
Timeout.prototype.cleared  = false;
Timeout.prototype.fn       = undefined;
Timeout.prototype.run      = function() {
    this.clear();
    this.fn();
};
Timeout.prototype.clear    = function() {
    var self   = this;
    if (typeof(self.id) !== 'undefined' && self.cleared === false) {
        clearTimeout(self.id);
    }
    self.cleared = true;
    self.id = undefined;
};


