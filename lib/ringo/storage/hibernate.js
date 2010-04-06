/**
 * @fileoverview Storage module for using Hibernate as ORM/persistence layer.
 */

importPackage(java.io);
include('ringo/engine');
include('ringo/functional');

addHostObject(org.ringojs.wrappers.Storable);
export('defineClass',
       'withSession',
       'getSession',
       'beginTransaction',
       'commitTransaction');

module.shared = true;
var registry = {};
var propsRegistry = {};
var self = this;
var log = require('ringo/logging').getLogger(module.id);
var isConfigured = false;
var config, sessionFactory;
const CHANGEME = 'CHANGEME';
const HBM_DOC_HEADER = '<?xml version="1.0" encoding="UTF-8"?>' +
        '<!DOCTYPE hibernate-mapping PUBLIC ' +
        '"-//Hibernate/Hibernate Mapping DTD 3.0//EN" ' +
        '"http://hibernate.sourceforge.net/hibernate-mapping-3.0.dtd">';
const HBM_DOC_TEMPLATE = <hibernate-mapping>
            <class entity-name={CHANGEME} table={CHANGEME}>
                <cache usage="read-write"/>
                <id name="id"
                    column="id"
                    type="long">
                    <generator class="native"/>
                </id>
            </class>
        </hibernate-mapping>;
const HBM_PROP_TEMPLATE = <property name={CHANGEME} column={CHANGEME}
        type={CHANGEME}/>;

function defineClass(type, mapping) {
    if (!propsRegistry[type]) {
        propsRegistry[type] = mapping;
    }
    var ctor = registry[type];
    if (!ctor) {
        ctor = registry[type] = Storable.defineClass(self, type);
        ctor.all = bindArguments(all, type);
        ctor.get = bindArguments(get, type);
        // ctor.query = bindArguments(query, type); // TODO: impl. query API.
    }
    return ctor;
}

/**
 * Do something within a Hibernate session transaction.
 *
 * @param {Function} func the stuff to do w/ session
 * @returns result
 */
function withSession(func) {
    var session, transaction, result;
    try {
        session = getSession();
        transaction = beginTransaction(session);
        result = func(session);
        commitTransaction(session);
    } catch (error) {
        abortTransaction(transaction, error);
    }
    return result;
}

/**
 * Begins a Hibernate session transaction.
 *
 * @param session the Hibernate session
 * @returns transaction
 */
function beginTransaction(session) {
    return transactionTemplate(session, function () {
        return session.beginTransaction();
    });
}

/**
 * Commits a Hibernate session transaction.
 *
 * @param session the Hibernate session
 * @returns transaction
 */
function commitTransaction(session) {
    return transactionTemplate(session, function () {
        var transaction = session.transaction;
        transaction.commit();
        return transaction;
    });
}

/**
 * Handles errors in transactions.
 *
 * @param transaction the transaction to handle
 * @param error the error in transaction
 */
function abortTransaction(transaction, error) {
    if (transaction) {
        transaction.rollback(); // Rollback if something went wrong.
    }
    log.error('Problem occurred within Hibernate session transaction.');
    throw error;
}

/**
 * Template for transactions (boilerplate code).
 *
 * @param session the Hibernate session
 * @param {Function} func the stuff to do w/ transaction
 */
function transactionTemplate(session, func) {
    var transaction;
    try {
        transaction = func();
    } catch (error) {
        abortTransaction(transaction, error);
    }
    return transaction;
}

/**
 * Gets a Hibernate DB session.
 *
 * @returns session
 */
function getSession() {
    if (!isConfigured) {
        configure();
    }
    return sessionFactory.currentSession;
}

/**
 * Configures Hibernate.
 */
function configure() {
    try {
        var configDirPath = new File('config').absolutePath;
        var fileInputStream = new FileInputStream(new File(configDirPath +
                File.separator + 'hibernate.properties'));
        var configProps = new java.util.Properties();
        configProps.load(fileInputStream);
        fileInputStream.close();
        config = new org.hibernate.cfg.Configuration();
        handleMappings(config);
        config.addDirectory(new File(configDirPath)).
                setProperties(configProps).
                // Use dynamic-map entity persistence mode.
                setProperty('hibernate.default_entity_mode', 'dynamic-map').
                // Transactions are handled by JDBC, no JTA is used.
                setProperty('hibernate.transaction.factory_class',
                        'org.hibernate.transaction.JDBCTransactionFactory').
                // Enable session binding to managed context.
                setProperty('hibernate.current_session_context_class',
                        'thread').
                // Enable query cache.
                setProperty('hibernate.cache.use_query_cache', 'true').
                // Use easy hibernate (eh) cache.
                setProperty('hibernate.cache.provider_class',
                        'org.hibernate.cache.EhCacheProvider').
                // Use c3p0 connection pooling.
                setProperty('hibernate.connection.provider_class',
                        'org.hibernate.connection.C3P0ConnectionProvider');
        sessionFactory = config.buildSessionFactory();
        isConfigured = true;
    } catch (error) {
        log.error('Something went wrong during Hibernate config.');
        throw error;
    }
}

/**
 * Handles mappings via `defineClass` & co.
 *
 * @params config the Hibernate configuration
 */
function handleMappings(config) {
    for (let entityName in propsRegistry) {
        var hbmDoc = HBM_DOC_TEMPLATE;
        hbmDoc['class'].@['entity-name'] = entityName;
        hbmDoc['class'].@table = entityName;
        var props = propsRegistry[entityName];
        for (let propName in props) {
            var hbmProp = HBM_PROP_TEMPLATE;
            hbmProp.@name = propName;
            hbmProp.@column = typeof props[propName].column === 'string' ?
                    props[propName].column : propName;
            hbmProp.@type = props[propName].type;
            if (props[propName].nullable === false) {
                hbmProp.@['not-null'] = 'true';
            }
            if (props[propName].unique === true) {
                hbmProp.@unique = 'true';
            }
            hbmDoc['class'].appendChild(hbmProp);
        }
        config.addXML(HBM_DOC_HEADER + hbmDoc);
    }
}

function create(type, key, entity) {
    var ctor = registry[type];
    return ctor.createInstance(key, entity);
}

function all(type) {
    return withSession(function (session) {
        var criteria = session.createCriteria(type);
        criteria.setCacheable(true);
        var i, list = new ScriptableList(criteria.list());
        for (i in list) {
            list[i] = create(type, list[i].id, list[i]);
            list[i].$type$ = type;
        }
        return list;
    });
}

function get(type, id) {
    return withSession(function (session) {
        var result = session.get(type, new java.lang.Long(id));
        if (result != null) {
            var entity = new ScriptableMap(result);
            result = create(type, entity.id, entity);
        }
        return result;
    });
}

function save(props, entity, entities) {
    if (entities && entities.contains(entity)) {
        return;
    }
    var isRoot = false;
    var session = getSession();
    if (!entities) {
        isRoot = true;
        entities = new java.util.HashSet();
        beginTransaction(session);
    }
    entities.add(entity);
    for (var id in props) {
        var value = props[id];
        if (isStorable(value)) {
            value.save(entities);
            value = value._key;
        } else if (value instanceof Array) {
            var list = new java.util.ArrayList();
            value.forEach(function (obj) {
                if (obj instanceof Storable) {
                    obj.save(entities);
                    list.add(obj._key);
                } else {
                    list.add(obj);
                }
            });
            value = list;
        } else if (value instanceof Date) {
            value = new java.util.Date(value.getTime());
        }
        entity[id] = value;
    }
    if (isRoot) {
        for each (var obj in entities.toArray()) {
            if (!isStorable(obj)) {
                obj = new ScriptableMap(obj);
            }
            if (obj.id != undefined) {
                obj.id = new java.lang.Long(obj.id);
            }
            session['saveOrUpdate(java.lang.String,java.lang.Object)'](obj.
                    $type$, obj);
        }
    }
    commitTransaction(session);
}

function remove(key) { // TODO: FIXME: doesn't work right ATM.
    withSession(function (session) {
        var obj = session.get(key[0], new java.lang.Long(getId(key)));
        if (obj != null) {
            session['delete'](obj);
        }
    });
}

function getProps(type, arg) {
    if (arg instanceof Object) {
        arg.$type$ = type;
        return arg;
    } else if (isEntity(arg)) {
        var id, value, props = {};
        for (id in arg) {
            // don't copy type and id, not supposed to be editable props
            if (id != '$type$' && id != 'id') {
                value = arg[id];
                if (value instanceof java.util.Set) {
                    var array = [];
                    for (var it = value.iterator(); it.hasNext(); ) {
                        var obj = it.next();
                        array.push(create(obj.$type$, obj.id, obj));
                    }
                    value = array;
                } else if (value instanceof java.util.Date) {
                    value = new Date(value.getTime());
                } else {
                    value = Context.javaToJS(value, global);
                }
                props[id] = value;
            }
        }
        return props;
    }
    return null;
}

function getEntity(type, arg) {
    if (isEntity(arg)) {
        return arg;
    } else if (arg instanceof Object) {
        var entity = new ScriptableMap(new java.util.HashMap(arg));
        entity.$type$ = type;
        return entity;
    }
    return null;
}

function getKey(type, arg) {
    if (isEntity(arg)) {
        return [type, arg.id];
    } else if (isKey(arg)) {
        return arg;
    }
    return null;
}

function getId(key) {
    return key[1];
}

function equalKeys(key1, key2) {
    return key1 && key2
            && key1[0] == key2[0]
            && key1[1] == key2[1];
}

function isKey(value) {
    return value instanceof Array
            && value.length == 2
            && typeof value[0] == 'string'
            && typeof value[1] == 'string';
}

function isEntity(value) {
    return value instanceof ScriptableMap;
}

function isStorable(value) {
    return value instanceof Storable;
}
