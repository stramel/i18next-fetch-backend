import test from 'ava'
import createTestServer from 'create-test-server'
import { createInstance } from 'i18next'
import FetchBackend from '../build'

let server

function createFetchBackend(options = {}, callback) {
  const i18next = createInstance();
  return i18next.use(FetchBackend).init({
    fallbackLng: 'en',
    ns: 'translation',
    backend: {
      loadPath: `${server.url}/{{lng}}/{{ns}}.json`,
    },
    ...options
  }, callback)
}

test.before(async () => {
  server = await createTestServer()
  server.get('/en/translation.json', () => ({
      "mykey": "mytranslation"
    }
    )
  )
})
test.after(async () => {
  await server.close();
});

test('loads english translation namespace', async (assert) => {
  const t = await createFetchBackend()

  assert.is(t('mykey'), 'mytranslation')
})

test.cb('fail to load non-existent language translation', (assert) => {
  createFetchBackend({
    fallbackLng: 'de',
  }, (err) => {
    assert.deepEqual(err, [
      `failed loading ${server.url}/de/translation.json`,
    ])
    assert.end()
  })
})

test.cb('fail to load non-existent namespace translation', assert => {
  createFetchBackend({
    ns: 'mynamespace',
  }, (err) => {
    assert.deepEqual(err, [
      `failed loading ${server.url}/en/mynamespace.json`,
    ])
    assert.end()
  })
})

test.cb('fail to load non-existent domain', assert => {
  createFetchBackend({
    backend: {
      loadPath: 'http://bad-localhost:3000/{{lng}}/{{ns}}.json',
    },
  }, (err) => {
    assert.deepEqual(err, [
      `failed making request http://bad-localhost:3000/en/translation.json`,
    ])
    assert.end()
  })
})

test.cb('calls the callback with an error if the fetch fails', assert => {
  createFetchBackend({
    backend: {
      loadPath: `${server.url}/{{lng}}/{{ns}}.json`,
      // mock fetch with a function that returns a rejection of cancelled request
      fetch: () => Promise.reject(new TypeError('cancelled'))
    }
  }, (err) => {
    assert.deepEqual(err, [
      `failed making request ${server.url}/en/translation.json`,
    ])
    assert.end()
  })
})

