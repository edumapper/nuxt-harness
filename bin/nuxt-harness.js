#!/usr/bin/env node
import { main } from '../src/run.js'

process.exitCode = await main(process.argv.slice(2))
