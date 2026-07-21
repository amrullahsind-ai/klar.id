plugins {
    id("com.android.application")
}

val releaseKeystorePath = System.getenv("KLAAR_KEYSTORE_FILE")
val releaseKeystorePassword = System.getenv("KLAAR_KEYSTORE_PASSWORD")
val releaseKeyAlias = System.getenv("KLAAR_KEY_ALIAS")
val releaseKeyPassword = System.getenv("KLAAR_KEY_PASSWORD")
val releaseSigningReady = listOf(
    releaseKeystorePath,
    releaseKeystorePassword,
    releaseKeyAlias,
    releaseKeyPassword
).all { !it.isNullOrBlank() }

android {
    namespace = "id.my.klaar.hadir"
    compileSdk = 35

    defaultConfig {
        applicationId = "id.my.klaar.hadir"
        minSdk = 24
        targetSdk = 35
        versionCode = (System.getenv("KLAAR_VERSION_CODE") ?: "2").toInt()
        versionName = System.getenv("KLAAR_VERSION_NAME") ?: "1.1.0"
    }

    signingConfigs {
        if (releaseSigningReady) {
            create("klaarRelease") {
                storeFile = file(releaseKeystorePath!!)
                storePassword = releaseKeystorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (releaseSigningReady) signingConfig = signingConfigs.getByName("klaarRelease")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.activity:activity:1.10.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core:1.15.0")
}
