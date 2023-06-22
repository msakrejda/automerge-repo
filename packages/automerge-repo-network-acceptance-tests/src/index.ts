import { PeerId, Repo, type NetworkAdapter } from "automerge-repo"
import {
  eventPromise,
  eventPromises,
} from "automerge-repo/src/helpers/eventPromise"
import { assert } from "chai"
import { describe, it } from "mocha"

const alice = "alice" as PeerId
const bob = "bob" as PeerId
const charlie = "charlie" as PeerId

/**
 * Runs a series of tests against a set of three peers, each represented by one or more instantiated network adapters
 */
export function runAdapterTests(_setup: SetupFn, title?: string): void {
  const setup = async () => {
    const { adapters, teardown } = await _setup()

    // these might be individual adapters or arrays of adapters; normalize them to arrays
    const [a, b, c] = adapters.map(toArray)

    return { adapters: [a, b, c], teardown }
  }

  describe(`Adapter acceptance tests ${title ? `(${title})` : ""}`, () => {
    it("can sync a document between two repos", async () => {
      const doTest = async (a: NetworkAdapter[], b: NetworkAdapter[]) => {
        const aliceRepo = new Repo({ network: a, peerId: alice })
        const bobRepo = new Repo({ network: b, peerId: bob })

        // Alice creates a document
        const aliceHandle = aliceRepo.create<TestDoc>()

        // Bob receives the document
        await eventPromise(bobRepo, "document")
        const bobHandle = bobRepo.find<TestDoc>(aliceHandle.documentId)

        // Alice changes the document
        aliceHandle.change(d => {
          d.foo = "bar"
        })

        // Bob receives the change
        await eventPromise(bobHandle, "change")
        assert.equal((await bobHandle.value()).foo, "bar")

        // Bob changes the document
        bobHandle.change(d => {
          d.foo = "baz"
        })

        // Alice receives the change
        await eventPromise(aliceHandle, "change")
        assert.equal((await aliceHandle.value()).foo, "baz")

        const v = await aliceHandle.value()
      }

      // Run the test in both directions, in case they're different types of adapters
      {
        const { adapters, teardown = NO_OP } = await setup()
        const [x, y] = adapters
        await doTest(x, y) // x is Alice
        teardown()
      }
      {
        const { adapters, teardown = NO_OP } = await setup()
        const [x, y] = adapters
        await doTest(y, x) // y is Alice
        teardown()
      }
    })

    it("can sync a document across three repos", async () => {
      const { adapters, teardown = NO_OP } = await setup()
      const [a, b, c] = adapters

      const aliceRepo = new Repo({ network: a, peerId: alice })
      const bobRepo = new Repo({ network: b, peerId: bob })
      const charlieRepo = new Repo({ network: c, peerId: charlie })

      // Alice creates a document
      const aliceHandle = aliceRepo.create<TestDoc>()
      const documentId = aliceHandle.documentId

      // Bob receives the document
      await eventPromise(bobRepo, "document")
      const bobHandle = bobRepo.find<TestDoc>(aliceHandle.documentId)

      // Charlie receives the document
      await eventPromise(charlieRepo, "document")
      const charlieHandle = charlieRepo.find<TestDoc>(aliceHandle.documentId)

      // Alice changes the document
      aliceHandle.change(d => {
        d.foo = "bar"
      })

      // Bob and Charlie receive the change
      await eventPromises([bobHandle, charlieHandle], "change")
      assert.equal((await bobHandle.value()).foo, "bar")
      assert.equal((await charlieHandle.value()).foo, "bar")

      // Charlie changes the document
      charlieHandle.change(d => {
        d.foo = "baz"
      })

      // Alice and Bob receive the change
      await eventPromises([aliceHandle, bobHandle], "change")
      assert.equal((await bobHandle.value()).foo, "baz")
      assert.equal((await charlieHandle.value()).foo, "baz")

      teardown()
    })
  })
}

const NO_OP = () => {}

type Network = NetworkAdapter | NetworkAdapter[]

export type SetupFn = () => Promise<{
  adapters: [Network, Network, Network]
  teardown?: () => void
}>

type TestDoc = {
  foo: string
}

const toArray = <T>(x: T | T[]) => (Array.isArray(x) ? x : [x])
