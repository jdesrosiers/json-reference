const curry = require("just-curry-it");
const contentTypeParser = require("content-type");
const resolveUrl = require("url-resolve-browser");
const fetch = require("./fetch");
const { uriReference, isObject } = require("./common");


const construct = (url, headers, body) => Object.freeze({ url, headers, body });
const extend = (doc, extras) => Object.freeze({ ...doc, ...extras });

const nil = construct("", {}, undefined);
const source = (doc) => doc.body;
const value = (doc) => contentTypeHandler(doc).value(doc);

const get = curry(async (url, contextDoc, options = {}) => {
  let result;
  const doc = await contextDoc;
  const resolvedUrl = resolveUrl(doc.url, url);

  if (uriReference(doc.url) === uriReference(resolvedUrl)) {
    result = extend(doc, { url: resolvedUrl });
  } else if (doc.embedded && uriReference(resolvedUrl) in doc.embedded) {
    const headers = { "content-type": doc.headers["content-type"] };
    result = construct(resolvedUrl, headers, doc.embedded[resolvedUrl]);
  } else {
    const response = await fetch(resolvedUrl, options);
    const headers = {};
    for (const [name, value] of response.headers.entries()) {
      headers[name] = value;
    }
    result = construct(resolvedUrl, headers, await response.text());
  }

  return await contentTypeHandler(result).get(result, options);
});

const step = curry(async (key, doc, options = {}) => {
  return contentTypeHandler(await doc).step(key, await doc, options);
});

const map = curry(async (fn, doc) => {
  return (await doc).map(fn);
});

const filter = curry(async (fn, doc, options = {}) => {
  return reduce(async (acc, item) => {
    return (await fn(item)) ? acc.concat([item]) : acc;
  }, [], doc, options);
});

const some = curry(async (fn, doc) => {
  const results = await map(fn, doc);
  return (await Promise.all(results))
    .some((a) => a);
});

const every = curry(async (fn, doc) => {
  const results = await map(fn, doc);
  return (await Promise.all(results))
    .every((a) => a);
});

const reduce = curry(async (fn, acc, doc) => {
  return (await doc).reduce(async (acc, item) => fn(await acc, item), acc);
});

const pipeline = curry((fns, doc) => {
  return fns.reduce(async (acc, fn) => fn(await acc), doc);
});

const contentTypes = {};

const defaultHandler = {
  get: async (doc) => doc,
  value: (doc) => isDocument(doc) ? source(doc) : doc,
  step: async (key, doc) => value(doc)[key]
};

const addContentType = (contentType, handler) => contentTypes[contentType] = handler;
const getContentType = (contentType) => contentTypes[contentType];

const contentTypeHandler = (doc) => {
  if (doc === nil || !isDocument(doc)) {
    return defaultHandler;
  }

  const contentType = contentTypeParser.parse(doc.headers["content-type"]).type;
  return contentType in contentTypes ? contentTypes[contentType] : defaultHandler;
};

const isDocument = (value) => isObject(value) && "url" in value;

module.exports = {
  construct, extend, addContentType, getContentType,
  nil, get, source, value, step, map, filter, reduce, some, every, pipeline
};
