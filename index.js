/*** DeviceMove Z-Way HA module *******************************************

Version: 1.0.0
(c) Maroš Kollár, 2015
-----------------------------------------------------------------------------
Author: maros@k-1.com <maros@k-1.com>
Description:
    This module checks weather updates via weatherundergound.com

******************************************************************************/

function DeviceMove (id, controller) {
    // Call superconstructor first (AutomationModule)
    DeviceMove.super_.call(this, id, controller);
}

inherits(DeviceMove, AutomationModule);

_module = DeviceMove;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

DeviceMove.prototype.init = function (config) {
    DeviceMove.super_.prototype.init.call(this, config);
    var self = this;
    
    self.controller.devices.create(
};

DeviceMove.prototype.stop = function () {
    DeviceMove.super_.prototype.stop.call(this);
    var self = this;
    
};

DeviceMove.prototype.addDevice = function(prefix,params) {
    var self = this;
    
    var device_params = _.deepExtend(
        params,
        {
            deviceId: "DeviceMove_"+prefix+"_" + this.id,
            defaults: {
                deviceType: "sensorMultilevel",
            },
            overlay: {},
            moduleId: prefix+"_"+this.id
        }
    );
    
    this.devices[prefix] = self.controller.devices.create(device_params);
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------




 