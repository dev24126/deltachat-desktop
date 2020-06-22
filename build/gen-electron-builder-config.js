const fs = require('fs-extra')
const { join } = require('path')
const files = [
  '!bin/',
  '!jenkins/',
  '!README_ASSETS/',
  '!README.md',
  '!.*',
  '!src/',
  '!scss/',
  '!static/',
  '!test/',
  '!ci_scripts/',
  '!tsc-dist/renderer/',
  '!**/*.d.ts',
  '!**/*.tsbuildinfo',
  '!**/*.js.map',
  '!**/*.css.map',
  '!html-dist/report.html',
]

const build = {}
build['appId'] = 'chat.delta.desktop.electron'
build['protocols'] = {
  name: 'QR code data',
  role: 'Viewer',
  schemes: ['openpgp4fpr'],
}

build['files'] = files

build['afterPack'] = 'build/afterPackHook.js'

// platform specific
build['mac'] = {
  category: 'public.app-category.social-networking',
}
build['dmg'] = {
  contents: [
    {
      x: 220,
      y: 200,
    },
    {
      x: 448,
      y: 200,
      type: 'link',
      path: '/Applications',
    },
  ],
}
build['linux'] = {
  target: ['AppImage', 'deb'],
  category: 'Network;Chat;InstantMessaging;',
  desktop: {
    comment: 'Delta Chat email-based messenger',
    keywords: 'dc;chat;delta;messaging;messenger;email',
  },
}
build['win'] = {
  icon: 'images/deltachat.ico',
}

build['appx'] = {
  applicationId: build['appId'],
  publisher: 'CN=C13753E5-D590-467C-9FCA-6799E1A5EC1E',
  publisherDisplayName: 'merlinux',
  identityName:'merlinux.DeltaChat'
}

// module.exports = build
// using this as a js module doesn#t work on windows
// because electron builder asks windows to open it as file instead of reading it.

fs.writeFileSync(
  join(__dirname, '../electron-builder.json5'),
  '// GENERATED, this file is generated by gen-electron-builder-config.js \n// run "pack:generate_config" to re-generate it\n' +
    JSON.stringify(build)
)
