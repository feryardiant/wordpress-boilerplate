const { readdirSync, readFileSync } = require('fs')
const { promisify } = require('util')
const execFile = promisify(require('child_process').execFile)
const path = require('path')

const { task, parallel, series, watch } = require('gulp')

const pkgJson = require('./../package.json')

const isProduction = exports.isProduction = process.env.NODE_ENV === 'production'

if (process.env.WP_ENV && !process.env.NODE_ENV) {
  process.env.NODE_ENV = process.env.WP_ENV
}

const globalConfig = {
  version: pkgJson.version,
  author: pkgJson.author,
  watch: false,

  paths: {
    img: 'img/**',
    css: 'scss/**/*.scss',
    js: 'js/**/*.js',
  },

  php: {
    phpcs: {
      bin: 'vendor/bin/phpcs'
    },
    wpPot: {}
  },

  img: {
    imagemin: {}
  },

  css: {
    stylelint: {
      failAfterError: isProduction,
      reporters: [
        {
          formatter: 'string',
          console: true
        }
      ],
      debug: !isProduction
    },
    sass: {
      includePaths: ['node_modules']
    }
  },

  js: {
    uglify: {},
    eslint: {},
    babel: pkgJson.babel
  },

  zip: {
    release: {
      sign: false,
      skip: {
        commit: true,
        tag: true
      }
    }
  }
}

const scandir = exports.scandir = (dir, dest) => {
  const readdirOpt = { withFileTypes: true }
  const tmpDir = 'public/app'
  const paths = globalConfig.paths
  const ignoreFiles = readFileSync(path.join(dir, '.distignore'), 'utf-8').split(/\r?\n/)

  return readdirSync(dir, readdirOpt).reduce((types, type) => {
    if (!['plugins', 'themes'].includes(type.name)) return types

    const sourceDir = readdirSync(path.join(dir, type.name), readdirOpt).reduce((sources, source) => {
      if (!source.isDirectory()) return sources

      let target = `${type.name}/${source.name}`
      sources = {
        type: type.name,
        path: `${dir}/${target}`,
        php: {
          src: [
            `${dir}/${target}/**/*.php`,
            `!${dir}/${target}/vendor`
          ],
          dest: `${tmpDir}/${target}/languages/${source.name}.pot`,
        }
      }

      Object.keys(paths).forEach(asset => {
        const assetPath = `${target}/assets`
        const srcPath = [
          `${dir}/${assetPath}/${paths[asset]}`
        ]

        if (['js', 'css'].includes(asset)) {
          const excludes = path.join(dir, assetPath, paths[asset].replace(/\./, '.min.'))
          srcPath.push(`!${excludes}`)
        }

        sources[asset] = {
          src: srcPath,
          dest: `${dir}/${assetPath}/${asset}`
        }
      })

      const zipSrc = [
        `${dir}/${target}/**`
      ]

      ignoreFiles.forEach((line) => {
        if (line && /^#/.test(line) === false) {
          const ignore = path.join(dir, target, line)
          zipSrc.push(`!${ignore}`)
        }
      })

      sources.zip = {
        src: zipSrc,
        dest: dest
      }

      return [source.name, sources]
    }, [])

    if (sourceDir.length > 0) {
      types.push(sourceDir)
    }

    return types
  }, [])
}

const configure = exports.configure = (src, dest, tasks) => {
  const buildTasks = []
  const zipTasks = []
  const toWatch = {}

  for (const [name, asset] of scandir(src, dest)) {
    const assetTasks = []
    const config = {
      name: name,
      type: asset.type,
      path: asset.path,
      version: globalConfig.version,
      author: globalConfig.author
    }

    for (const key of Object.keys(asset)) {
      if (['type', 'path'].includes(key)) {
        continue
      }

      if (['js', 'css'].includes(key)) {
        config.rename = {
          suffix: '.min'
        }

        config.browserslist = pkgJson.browserslist
      }

      const taskName = `${name}:${key}`

      if (globalConfig.hasOwnProperty(key)) {
        Object.assign(config, globalConfig[key])
      }

      if ('zip' !== key) {
        toWatch[taskName] = asset[key].src
        assetTasks.push(taskName)
      } else {
        config.base = path.join(process.cwd(), config.path, '..')
        zipTasks.push(taskName)
      }

      task(taskName, (done) => {
        return tasks[key]({
          src: asset[key].src,
          dest: asset[key].dest,
          config: config
        }, done)
      })
    }

    task(`${name}:build`, parallel(...assetTasks))
    buildTasks.push(...assetTasks)
  }

  task('build', parallel(...buildTasks))
  task('zip', parallel(...zipTasks))
  return toWatch
}

exports.watch = (tasks, browserSync) => {
  const reload = (done) => {
    browserSync.reload()
    done()
  }

  for (const [taskName, src] of Object.entries(tasks)) {

    watch(src, series(taskName, reload))
  }
}
