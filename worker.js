"use strict";
console.log(data);

// change arg lists
function list_changed(l) {
  var out = l.map(x => "change:" + x).join(" ");
  return out;
}

function xpCost(k, b, xp) {
  var cost = 0;
  var i = b
  while (i < b + xp) {
    i += 1
    cost += k*i
  }
  return cost;
}

function attach_field_sum(name, fields, postfix) {
  var deps = Object.keys(fields).map(x => x + "_" + postfix);
  on(list_changed(deps), function(eventInfo) {
    console.log(name, postfix, "deps changed");
    getAttrs(deps, function(v) {
      var d = {};
      var cost = 0;
      for (field in fields) {
        var val = parseInt(v[field + "_" + postfix], 10);
        if (isNaN(val)) {
          console.log(field + "_" + postfix, " is NaN");
        } else {
          cost += val;
        }
      }
      d[name + "_" + postfix] = cost;
      setAttrs(d);
      console.log(d);
    });
  });
}

function attach_property(name) {
  //console.log("attaching property " + name);
  var tot_deps = [
    name + "_base",
    name + "_xp"
  ];
  var radio_deps = [
    name + "_radio",
    name
  ];

  // update total if deps change
  on(list_changed(tot_deps) + " sheet:opened", function() {
    console.log(name + " total deps changed");
    getAttrs(tot_deps, function(v) {
      set_d = {};
      var b = parseInt(v[name + "_base"], 10);
      var xp = parseInt(v[name + "_xp"], 10);
      var tot = b + xp;
      console.log("updating total for " + name + ", b:", b, " xp:", xp)
      set_d[name] = tot;
      setAttrs(set_d);
    });
  });

  // update xp, base if radio changes
  on("change:" + name + "_radio", function() {
    console.log(name + " radio changed");
    getAttrs([].concat(radio_deps, tot_deps), function(v) {
      set_d = {};
      var b = parseInt(v[name + "_base"], 10);
      var xp = parseInt(v[name + "_xp"], 10);
      var radio = parseInt(v[name + "_radio"], 10);
      console.log("updating total for " + name + " b:", b, " radio:", radio);
      if (radio < b) {
        b = radio;
        xp = 0;
      } else {
        xp = radio - b;
      }
      set_d[name + "_base"] = b;
      set_d[name + "_xp"] = xp;
      setAttrs(set_d);
    });
  });

  // update radio if total changes
  on("change:" + name, function() {
    console.log(name + " total changed");
    getAttrs([].concat(radio_deps, tot_deps), function(v) {
      set_d = {};
      var tot = parseInt(v[name], 10);
      console.log("updating radio for " + name + " tot:", tot);
      set_d[name + "_radio"] = tot;
      setAttrs(set_d);
    });
  });
}

function attach_type_bar(key_type, type, data) {
  console.log("attaching type", key_type);

  // handle no field case
  if (type.fields === undefined) {
    type.fields = {};
  }

  // properties
  for (var key_prop in type.fields) {
    attach_property(key_prop);
  }

  // base
  var base_deps = Object.keys(type.fields).map(x => x + '_base');
  on(list_changed(base_deps), function() {
    console.log("base_" + key_type + " deps changed");
    getAttrs(base_deps, function(v) {
      var d = {};
      var base = 0;
      for (i in base_deps) {
        base += parseInt(v[base_deps[i]], 10);
      }
      base -= Object.keys(type.fields).length*type.initial_base;
      d[key_type + "_base"] = base;
      setAttrs(d);
      console.log(d);
    });
  });

  // xp
  var xp_deps = [].concat(...Object.keys(type.fields).map(x => [x + "_xp", x + "_base", "clan"]));
  on(list_changed(xp_deps), function() {
    console.log(key_type + " xp deps changed");
    getAttrs(xp_deps, function(v) {
      var d = {};
      var cost = 0;
      for (name in type.fields) {
        var b = parseInt(v[name + "_base"], 10);
        var xp = parseInt(v[name + "_xp"], 10);
        var mult_xp_cost = type.mult_xp_cost;
        if (key_type === "disciplines") {
          var clan = v["clan"];
          if (clan === "caitiff") {
            mult_xp_cost = type.mult_xp_cost_caitiff;
            console.log("caitiff discipline");
          } else if (data.clan[clan].disciplines.indexOf(name) > -1) {
            mult_xp_cost = type.mult_xp_cost_clan;
            console.log(name, "is a ", clan, "disciplines");
          } else {
            console.log(name, "is not a", clan, "disciplines");
          }
        }
        cost += xpCost(mult_xp_cost, b, xp);
      }
      d[key_type + "_xp"] = cost;
      setAttrs(d);
      console.log(d);
    });
  });
}

function attach_section(name, section, data) {
  console.log("attaching section", name);

  // handle no field case
  if (section.fields === undefined) {
    section.fields = {};
  }

  for (var key_type in section.fields) {
    var type = section.fields[key_type];
    if (type.field_type === "bar") {
      attach_type_bar(key_type, type, data);
    }
  }

  // update field sums
  attach_field_sum(name, section.fields, "xp");
}

function attach_health(data) {
  var health_deps = ["health_max", "dmg_superficial", "dmg_aggravated"];
  on(list_changed(health_deps), function(eventInfo) {
    console.log("damage changed");
    getAttrs(health_deps, function(v) {
      var dmg = {
        sup: parseInt(v["dmg_superficial"], 10),
        aggr: parseInt(v["dmg_aggravated"], 10)
      };
      var health_max = parseInt(v["health_max"], 10);
      for (key in dmg) {
        if (dmg[key] < 0) {
          dmg[key] = 0;
        }
      }

      var count = 0;
      while (dmg["sup"] + dmg["aggr"] > health_max) {
        if (dmg["sup"] > 1) {
          console.log("carrying superficial damage to aggravated");
          dmg["sup"] -= 2;
          dmg["aggr"] += 1;
        } else if (dmg["aggr"] > 0) {
          console.log("max damage reached");
          dmg["sup"] = 0;
          dmg["aggr"] = health_max;
        }
        // safeguard for infinite loop
        if (count++ > 100) {
          console.error("exceeded maximum loop count in health update");
          break;
        }
      }
      var health = health_max - (dmg["sup"] + dmg["aggr"]);
      var health_total_max = 2*health_max;
      var health_total = health_total_max - (dmg["sup"] + 2*dmg["aggr"]);
      var penalty = 0;
      var health_state = "OK";
      if (data["health"][health] != undefined) {
        penalty = data["health"][health]["penalty"];
        health_state = data["health"][health]["state"];
      }
      setAttrs({
        dmg_superficial: dmg["sup"],
        dmg_aggravated: dmg["aggr"],
        health: health,
        health_total: health_total,
        health_total_max: health_total_max,
        wound_penalty: penalty,
        health_state: health_state
      });
    });
  });
}

function attach_will(data) {
  var will_deps = ["will_max", "will_superficial", "will_aggravated"];
  on(list_changed(will_deps), function(eventInfo) {
    console.log("will changed");
    getAttrs(will_deps, function(v) {
      var dmg = {
        sup: parseInt(v["will_superficial"], 10),
        aggr: parseInt(v["will_aggravated"], 10)
      };
      var will_max = parseInt(v["will_max"], 10);
      for (key in dmg) {
        if (dmg[key] < 0) {
          dmg[key] = 0;
        }
      }

      var count = 0;
      while (dmg["sup"] + dmg["aggr"] > will_max) {
        if (dmg["sup"] > 1) {
          console.log("carrying superficial damage to aggravated");
          dmg["sup"] -= 2;
          dmg["aggr"] += 1;
        } else if (dmg["aggr"] > 0) {
          console.log("max damage reached");
          dmg["sup"] = 0;
          dmg["aggr"] = will_max;
        }
        // safeguard for infinite loop
        if (count++ > 100) {
          console.error("exceeded maximum loop count in will update");
          break;
        }
      }
      var will = will_max - (dmg["sup"] + dmg["aggr"]);
      var penalty = 0;
      var will_state = "OK";
      if (data["will"][will] != undefined) {
        penalty = data["will"][will]["penalty"];
        will_state = data["will"][will]["state"];
      }
      var will_total_max = 2*will_max;
      var will_total = will_total_max - (dmg["sup"] + 2*dmg["aggr"]);
      setAttrs({
        will_superficial: dmg["sup"],
        will_aggravated: dmg["aggr"],
        will: will,
        will_total: will_total,
        will_total_max: will_total_max,
        will_penalty: penalty,
        will_state: will_state
      });
    });
  });
}



function attach_data(data) {
  console.log("attaching data");

  if (data.sections.fields === undefined) {
    data.sections.fields = {};
  }

  for (var key_sect in data.sections.fields) {
    var sect = data.sections.fields[key_sect];
    attach_section(key_sect, sect, data);
  }

  // attach field sums
  attach_field_sum("total", data.sections.fields, "xp");

  // attach health
  attach_health(data);

  // attach will
  attach_will(data);
}

attach_data(data);

on("sheet:opened", function() {
  console.log("sheet opened");
});


// vim: set et fenc=utf-8 ff=unix ft=javascript sts=0 sw=2 ts=2 :
