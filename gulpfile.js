const path = require('path')

const bs = require('browser-sync').create()
const gulp = require('gulp')
const version = require('standard-version')

const autoprefixer = require('gulp-autoprefixer')
const babel = require('gulp-babel')
const cleanCSS = require('gulp-clean-css')
const eslint = require('gulp-eslint')
const imagemin = require('gulp-imagemin')
const php = require('gulp-connect-php')
const phpcs = require('gulp-phpcs')
const rename = require('gulp-rename')
const sass = require('gulp-sass')
const stylelint = require('gulp-stylelint')
const uglify = require('gulp-uglify')
const wpPot = require('gulp-wp-pot')
const zip = require('gulp-zip')

require('dotenv').config()

const { configure, scandir, watch, isProduction } = require('./build/util')
const yargs = require('yargs')

const tasks = configure('source', 'build', {
  /**
   * Lint PHP fiels and generate translation file.
   *
   * @param {Object}       param0
   * @param {Array|String} param0.src
   * @param {Array|String} param0.dest
   * @param {Object}       param0.
   * @return {stream}
   */
  php ({ src, dest, config }) {
    config.wpPot = {
      domain: config.name,
      package: `${config.name} v${config.version}`,
      relativeTo: config.path,
      lastTranslator: config.author,
      team: config.author
    }

    config.phpcs.standard = 'source/phpcs.xml'

    return gulp.src(src)
      .pipe(phpcs(config.phpcs))
      .pipe(phpcs.reporter('log'))
      .pipe(wpPot(config.wpPot))
      .pipe(gulp.dest(dest))
  },

  /**
   * Compile SCSS files to CSS & minify.
   *
   * @param {Object}       param0
   * @param {Array|String} param0.src
   * @param {Array|String} param0.dest
   * @param {Object}       param0.config
   * @return {stream}
   */
  css ({ src, dest, config }) {
    return gulp.src(src, { sourcemaps: true })
      .pipe(stylelint(config.stylelint))
      .pipe(sass(config.sass).on('error', sass.logError))
      .pipe(autoprefixer())
      .pipe(gulp.dest(dest))
      .pipe(cleanCSS())
      .pipe(rename(config.rename))
      .pipe(gulp.dest(dest, { sourcemaps: true }))
      .pipe(bs.stream())
  },

  /**
   * Minify javascripts.
   *
   * @param {Object}       param0
   * @param {Array|String} param0.src
   * @param {Array|String} param0.dest
   * @param {Object}       param0.config
   * @return {stream}
   */
  js ({ src, dest, config }) {
    const stream = gulp.src(src, { sourcemaps: true })
      .pipe(eslint(config.eslint))

    if (isProduction) {
      stream.pipe(eslint.failAfterError())
    }

    return stream
      .pipe(babel(config.babel))
      .pipe(uglify(config.uglify))
      .pipe(rename(config.rename))
      .pipe(gulp.dest(dest, { sourcemaps: true }))
      .pipe(bs.stream())
  },

  /**
   * Optimize images.
   *
   * @param {Object}       param0
   * @param {Array|String} param0.src
   * @param {Array|String} param0.dest
   * @param {Object}       param0.config
   * @return {stream}
   */
  img ({ src, dest, config }) {
    return gulp.src(src)
      .pipe(imagemin(config.imagemin))
      .pipe(gulp.dest(dest))
      .pipe(bs.stream())
  },

  /**
   * Generate CHANGELOG.md for each then Packaging them.
   *
   * @param {Object}       param0
   * @param {Array|String} param0.src
   * @param {Array|String} param0.dest
   * @param {Object}       param0.config
   * @return {stream}
   */
  zip: async ({ src, dest, config }, done) => {
    const del = require('del')
    const { argv } = yargs.options({
      bump: {
        describe: 'Bump version before zipping',
        default: true,
        type: 'boolean'
      }
    })

    config.release.path = config.path
    config.release.infile = `${config.path}/CHANGELOG.md`

    if (argv.bump) {
      // Generate CHANGELOG.md file inside source directory
      await version(config.release)
    }

    return gulp.src(src, { base: config.base })
      .pipe(zip(`${config.name}-${config.version}.zip`, config.zip))
      .pipe(gulp.dest(dest))
  }
})

/**
 * Start php server.
 *
 * @async
 * @returns {String}
 */
const phpServer = () => new Promise((resolve, reject) => {
  const { argv } = yargs.options({
    proxy: {
      alias: 'p',
      describe: 'Enable proxy',
      default: process.env.WP_HOME,
      type: 'string'
    }
  })

  let url

  try {
    url = new URL(argv.proxy)
  } catch (err) {
    return reject(err)
  }

  // Don't start php dev server if the hostname isn't localhost
  // In case you've already set your envvar to something like:
  // WP_HOME = http://wpdev.local
  if (url.hostname !== 'localhost') {
    return resolve(url)
  } else {
    if (url.port === '') {
      url.port = 8080
    }
  }

  process.on('exit', php.closeServer)

  php.server({
    port: url.port,
    hostname: url.hostname,
    ini: 'public/.user.ini',
    base: 'public',
    router: './server.php',
    configCallback (type, args) {
      if (type === php.OPTIONS_PHP_CLI_ARR) {
        return [
          '-e',
          '-d', 'cli_server.color=on'
        ].concat(args)
      }

      return args
    }
  }, () => {
    resolve(url)
  })
})

/**
 * Start php server.
 *
 * @async
 * @param {URL} url
 * @returns {String}
 */
const bSync = (url) => new Promise((resolve, reject) => {
  const { argv } = yargs.options({
    open: {
      alias: 'o',
      describe: 'Open in browser',
      default: false,
      type: 'boolean'
    },
    notify: {
      alias: 'n',
      describe: 'Enable notification',
      default: false,
      type: 'boolean'
    },
  })

  bs.init({
    proxy: url.toString(),
    baseDir: './public',
    notify: argv.notify,
    open: argv.open,
    serveStatic: [
      {
        route: '/wp-admin/css',
        dir: 'public/wp/wp-admin/css'
      },
      {
        route: '/wp-admin/images',
        dir: 'public/wp/wp-admin/images',
      },
      {
        route: '/wp-admin/js',
        dir: 'public/wp/wp-admin/js',
      },
      {
        route: '/wp-includes/css',
        dir: 'public/wp/wp-includes/css',
      },
      {
        route: '/wp-includes/images',
        dir: 'public/wp/wp-includes/images',
      },
      {
        route: '/wp-includes/js',
        dir: 'public/wp/wp-includes/js',
      }
    ]
  }, () => {
    url.port = 3000
    resolve(url)
  })
})

/**
 * Execute end-to-end test using webdriver.io and browser-stack.
 *
 * @async
 * @param {Function} done
 */
exports.e2e = (done) => {
  const { default: Launcher } = require('@wdio/cli')

  return phpServer().then(bSync).then(url => {
    const wdio = new Launcher('tests/wdio.config.js', {
      baseUrl: url.toString(),
      onComplete (code) {
        done()
        process.exit(code)
      }
    })

    return wdio.run()
  })
}

/**
 * Generate CHANGELOG.md file.
 */
exports.release = async () => {
  const { argv } = yargs.options({
    pre: {
      describe: 'Bump as prerelase version',
      type: 'string'
    },
    as: {
      describe: 'Bump as version',
      type: 'string'
    }
  })

  const releaseConfig = {
    sign: true,
    scripts: {
      prerelease: 'gulp build && git add -A',
      postbump: 'gulp zip',
    }
  }

  if (typeof argv.pre === 'string') {
    releaseConfig.prerelease = argv.pre
  }

  if (typeof argv.as === 'string') {
    releaseConfig.releaseAs = argv.as
  }

  await version(releaseConfig)
}

/**
 * Start php development server and watch files changes through browserSync.
 */
exports.default = async () => {
  const url = await phpServer()

  await bSync(url)

  watch(tasks, bs)
}
