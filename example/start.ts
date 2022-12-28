import cluster from 'cluster'
import { cpus } from 'os'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { start } from './main'

// change to this directory
process.chdir(dirname(fileURLToPath(import.meta.url)))

// resolve number of clusters
const maxClusters = cpus().length
let clusters = 1
if (clusters > maxClusters) clusters = maxClusters

// start process
if (clusters <= 0) {
  // running only one instance

  start()

} else {
  // running multiple instances

  if (cluster.isMaster) {
    console.log('using cluster mode')

    const workerPids = new Map<number, number>()
    const fork = (index: number) => {
      const worker = cluster.fork({ NODE_APP_INSTANCE: index })
      workerPids.set(worker.id, index)
    }

    for (let i = 0; i < clusters; i++) {
      fork(i)
    }

    cluster.on('exit', (worker) => {
      const index = workerPids.get(worker.id)
      console.log(`worker died (pid:${worker.process.pid} idx:${index})`)
      if (index === undefined) return
      workerPids.delete(worker.id)
      // fork(index)
    })

  } else {

    start()
    console.log(`worker created (pid:${process.pid})`)

  }
}
