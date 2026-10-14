// Keeps release signing through `expo prebuild`.
//
// android/ is generated and `--clean` deletes it wholesale, so neither the signing config nor the
// key can live there. Without this plugin a regenerated project signs release builds with the debug
// key — silently, since that still produces an installable APK. Android identifies an app by its
// signature, so such an APK could never update an installed copy.
//
// The key and its passwords sit at the repository root, outside android/ and outside git. This only
// teaches the generated build where to look.

const { withAppBuildGradle } = require('expo/config-plugins');

const LOADER = `
// Release signing, read from keystore.properties at the repository root (outside the generated
// android/ directory, so a prebuild cannot delete it). Absent — a fresh clone, or CI without the
// key — the build falls back to the debug signature rather than failing.
def keystorePropertiesFile = rootProject.file("../keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
`;

const RELEASE_CONFIG = `        release {
            if (keystoreProperties['storeFile']) {
                storeFile rootProject.file("../" + keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;

    if (gradle.includes('keystorePropertiesFile')) {
      return mod;
    }

    gradle = gradle.replace('android {', `${LOADER}\nandroid {`);

    // Add the release signing config beside the debug one Expo writes.
    gradle = gradle.replace(/(signingConfigs \{\n)/, `$1${RELEASE_CONFIG}`);

    // And point the release build at it when the key is there.
    gradle = gradle.replace(
      /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig keystoreProperties['storeFile'] ? signingConfigs.release : signingConfigs.debug",
    );

    mod.modResults.contents = gradle;

    return mod;
  });
};
