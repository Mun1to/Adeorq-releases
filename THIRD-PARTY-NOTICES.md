# Avisos de terceros

Adeorq se apoya en software libre de otras personas. Este documento existe
porque licencias como MIT, Apache-2.0, ISC y BSD piden que su aviso de copyright
viaje con el programa cuando se distribuye, y Adeorq se distribuye como binario.

Cada componente sigue siendo de quien lo escribió y se usa bajo su propia
licencia, que es la que manda sobre ese componente. Nada de lo que hay aquí es
de Adeorq ni cambia por estar en esta lista.

Resumen: **36** componentes de la interfaz y **550** del núcleo en Rust.
No hay ninguna dependencia con licencia GPL o AGPL. Hay cinco con MPL-2.0, todas
dentro de Tauri: la MPL solo obliga a publicar los cambios de SUS propios
archivos, y Adeorq no modifica ninguno.

El texto íntegro de cada licencia viaja dentro del paquete de la dependencia
correspondiente y puede consultarse en su repositorio de origen. De 586
componentes, 325 declaran un titular de copyright explícito, recogido abajo.

## Interfaz (npm, dependencias de producción)

| Componente | Versión | Licencia | Copyright |
| --- | --- | --- | --- |
| @tauri-apps/api | 2.11.1 | Apache-2.0 OR MIT | Copyright 2017 - Present Tauri Apps Contributors |
| @tauri-apps/plugin-dialog | 2.7.2 | MIT OR Apache-2.0 | Copyright Text: 2019-2022, The Tauri Programme in the Commons Conservancy |
| @tauri-apps/plugin-notification | 2.3.3 | MIT OR Apache-2.0 | Copyright Text: 2019-2022, The Tauri Programme in the Commons Conservancy |
| @tauri-apps/plugin-opener | 2.5.4 | MIT OR Apache-2.0 | Copyright Text: 2019-2022, The Tauri Programme in the Commons Conservancy |
| @tauri-apps/plugin-process | 2.3.1 | MIT OR Apache-2.0 | Copyright Text: 2019-2022, The Tauri Programme in the Commons Conservancy |
| @tauri-apps/plugin-updater | 2.10.1 | MIT OR Apache-2.0 | Copyright Text: 2019-2022, The Tauri Programme in the Commons Conservancy |
| @types/d3-color | 3.1.3 | MIT | — |
| @types/d3-drag | 3.0.7 | MIT | — |
| @types/d3-interpolate | 3.0.4 | MIT | — |
| @types/d3-selection | 3.0.11 | MIT | — |
| @types/d3-transition | 3.0.9 | MIT | — |
| @types/d3-zoom | 3.0.8 | MIT | — |
| @types/react | 19.2.17 | MIT | — |
| @types/react-dom | 19.2.3 | MIT | — |
| @xterm/addon-fit | 0.11.0 | MIT | Copyright 2019, The xterm.js authors (https://github.com/xtermjs/xterm.js) |
| @xterm/addon-webgl | 0.19.0 | MIT | Copyright 2018, The xterm.js authors (https://github.com/xtermjs/xterm.js) |
| @xterm/xterm | 6.0.0 | MIT | Copyright 2017-2019, The xterm.js authors (https://github.com/xtermjs/xterm.js) |
| @xyflow/react | 12.11.2 | MIT | Copyright 2019-2025 webkid GmbH |
| @xyflow/system | 0.0.79 | MIT | — |
| classcat | 5.0.5 | MIT | — |
| csstype | 3.2.3 | MIT | — |
| d3-color | 3.1.0 | ISC | — |
| d3-dispatch | 3.0.1 | ISC | — |
| d3-drag | 3.0.0 | ISC | — |
| d3-ease | 3.0.1 | BSD-3-Clause | — |
| d3-interpolate | 3.0.1 | ISC | — |
| d3-selection | 3.0.0 | ISC | — |
| d3-timer | 3.0.1 | ISC | — |
| d3-transition | 3.0.1 | ISC | — |
| d3-zoom | 3.0.0 | ISC | — |
| marked | 18.0.7 | MIT | Copyright 2018+, MarkedJS (https://github.com/markedjs/) |
| react | 19.2.8 | MIT | — |
| react-dom | 19.2.8 | MIT | — |
| scheduler | 0.27.0 | MIT | — |
| use-sync-external-store | 1.6.0 | MIT | — |
| zustand | 4.5.7 | MIT | — |

## Núcleo (Rust, crates)

| Componente | Versión | Licencia | Copyright |
| --- | --- | --- | --- |
| adler2 | 2.0.1 | 0BSD OR MIT OR Apache-2.0 | — |
| aho-corasick | 1.1.4 | Unlicense OR MIT | Copyright 2015 Andrew Gallant |
| alloc-no-stdlib | 2.0.4 | BSD-3-Clause | Copyright 2016 Dropbox, Inc |
| alloc-stdlib | 0.2.4 | BSD-3-Clause | — |
| android_system_properties | 0.1.5 | MIT/Apache-2.0 | Copyright 2013 Nicolas Silva |
| anyhow | 1.0.104 | MIT OR Apache-2.0 | — |
| arbitrary | 1.4.2 | MIT OR Apache-2.0 | Copyright 2019 Manish Goregaokar |
| async-broadcast | 0.7.2 | MIT OR Apache-2.0 | Copyright 2020 Yoshua Wuyts |
| async-channel | 2.5.0 | Apache-2.0 OR MIT | — |
| async-executor | 1.14.0 | Apache-2.0 OR MIT | — |
| async-io | 2.6.0 | Apache-2.0 OR MIT | — |
| async-lock | 3.4.2 | Apache-2.0 OR MIT | — |
| async-process | 2.5.0 | Apache-2.0 OR MIT | — |
| async-recursion | 1.1.1 | MIT OR Apache-2.0 | — |
| async-signal | 0.2.14 | Apache-2.0 OR MIT | — |
| async-task | 4.7.1 | Apache-2.0 OR MIT | — |
| async-trait | 0.1.91 | MIT OR Apache-2.0 | — |
| atk | 0.18.2 | MIT | — |
| atk-sys | 0.18.2 | MIT | — |
| atomic-waker | 1.1.2 | Apache-2.0 OR MIT | Copyright 2016 Alex Crichton |
| auto-launch | 0.6.0 | MIT | Copyright 2022 zzzgydi |
| autocfg | 1.5.1 | Apache-2.0 OR MIT | Copyright 2018 Josh Stone |
| aws-lc-rs | 1.17.0 | ISC AND (Apache-2.0 OR ISC) | — |
| aws-lc-sys | 0.41.0 | ISC AND (Apache-2.0 OR ISC) AND Apache-2.0 AND MIT AND BSD-3-Clause AND (Apache-2.0 OR ISC OR MIT) AND (Apache-2.0 OR ISC OR MIT-0) | Copyright 2014-2024 Google Inc |
| base64 | 0.21.7 | MIT OR Apache-2.0 | Copyright 2015 Alice Maz |
| base64 | 0.22.1 | MIT OR Apache-2.0 | Copyright 2015 Alice Maz |
| bit-set | 0.8.0 | Apache-2.0 OR MIT | Copyright 2023 The Rust Project Developers |
| bit-vec | 0.8.0 | Apache-2.0 OR MIT | Copyright 2023 The Rust Project Developers |
| bitflags | 1.3.2 | MIT/Apache-2.0 | Copyright 2014 The Rust Project Developers |
| bitflags | 2.13.1 | MIT OR Apache-2.0 | Copyright 2014 The Rust Project Developers |
| block-buffer | 0.10.4 | MIT OR Apache-2.0 | Copyright 2018-2019 The RustCrypto Project Developers |
| block2 | 0.6.2 | MIT | — |
| blocking | 1.6.2 | Apache-2.0 OR MIT | — |
| brotli | 8.0.4 | BSD-3-Clause AND MIT | Copyright 2016 Dropbox, Inc |
| brotli-decompressor | 5.0.3 | BSD-3-Clause/MIT | Copyright 2016 Dropbox, Inc |
| bs58 | 0.5.1 | MIT/Apache-2.0 | Copyright 2016 The roaring-rs developers |
| bumpalo | 3.20.3 | MIT OR Apache-2.0 | Copyright 2019 Nick Fitzgerald |
| bytemuck | 1.25.2 | Zlib OR Apache-2.0 OR MIT | Copyright 2019 Daniel "Lokathor" Gee |
| byteorder | 1.5.0 | Unlicense OR MIT | Copyright 2015 Andrew Gallant |
| bytes | 1.12.1 | MIT | Copyright 2018 Carl Lerche |
| cairo-rs | 0.18.5 | MIT | — |
| cairo-sys-rs | 0.18.2 | MIT | — |
| camino | 1.2.4 | MIT OR Apache-2.0 | — |
| cargo_metadata | 0.19.2 | MIT | — |
| cargo_toml | 0.22.3 | Apache-2.0 OR MIT | — |
| cargo-platform | 0.1.9 | MIT OR Apache-2.0 | — |
| cc | 1.4.0 | MIT OR Apache-2.0 | Copyright 2014 Alex Crichton |
| cesu8 | 1.1.0 | Apache-2.0/MIT | — |
| cfb | 0.7.3 | MIT | Copyright 2017 Matthew D. Steele |
| cfg_aliases | 0.1.1 | MIT | Copyright 2020 Katharos Technology |
| cfg_aliases | 0.2.2 | MIT | Copyright 2020 Katharos Technology |
| cfg-expr | 0.15.8 | MIT OR Apache-2.0 | Copyright 2019 Embark Studios |
| cfg-if | 1.0.4 | MIT OR Apache-2.0 | Copyright 2014 Alex Crichton |
| chrono | 0.4.45 | MIT OR Apache-2.0 | Copyright 2014--2026, Kang Seonghoon and |
| cmake | 0.1.58 | MIT OR Apache-2.0 | Copyright 2014 Alex Crichton |
| combine | 4.6.7 | MIT | Copyright 2015 Markus Westerlind |
| concurrent-queue | 2.5.0 | Apache-2.0 OR MIT | — |
| cookie | 0.18.1 | MIT OR Apache-2.0 | Copyright 2017 Sergio Benitez |
| core-foundation | 0.10.1 | MIT OR Apache-2.0 | Copyright 2012-2013 Mozilla Foundation |
| core-foundation-sys | 0.8.7 | MIT OR Apache-2.0 | Copyright 2012-2013 Mozilla Foundation |
| core-graphics | 0.25.0 | MIT OR Apache-2.0 | Copyright 2012-2013 Mozilla Foundation |
| core-graphics-types | 0.2.0 | MIT OR Apache-2.0 | Copyright 2012-2013 Mozilla Foundation |
| cpufeatures | 0.2.17 | MIT OR Apache-2.0 | Copyright 2020-2025 The RustCrypto Project Developers |
| crc32fast | 1.5.0 | MIT OR Apache-2.0 | Copyright 2018 Sam Rijs, Alex Crichton and contributors |
| crossbeam-channel | 0.5.16 | MIT OR Apache-2.0 | Copyright 2019 The Crossbeam Project Developers |
| crossbeam-utils | 0.8.22 | MIT OR Apache-2.0 | Copyright 2019 The Crossbeam Project Developers |
| crypto-common | 0.1.7 | MIT OR Apache-2.0 | Copyright 2021 RustCrypto Developers |
| cssparser | 0.36.0 | MPL-2.0 | — |
| cssparser-macros | 0.6.1 | MPL-2.0 | — |
| ctor | 0.8.0 | Apache-2.0 OR MIT | — |
| ctor-proc-macro | 0.0.7 | Apache-2.0 OR MIT | — |
| darling | 0.23.0 | MIT | Copyright 2017 Ted Driggs |
| darling_core | 0.23.0 | MIT | Copyright 2017 Ted Driggs |
| darling_macro | 0.23.0 | MIT | Copyright 2017 Ted Driggs |
| dbus | 0.9.12 | Apache-2.0/MIT | Copyright 2014-2018 David Henningsson <diwic@ubuntu.com> and other contributors |
| deranged | 0.5.8 | MIT OR Apache-2.0 | Copyright 2024 Jacob Pratt et al |
| derive_arbitrary | 1.4.2 | MIT OR Apache-2.0 | Copyright 2019 Manish Goregaokar |
| derive_more | 2.1.1 | MIT | Copyright 2016 Jelte Fennema |
| derive_more-impl | 2.1.1 | MIT | Copyright 2016 Jelte Fennema |
| digest | 0.10.7 | MIT OR Apache-2.0 | Copyright 2017 Artyom Pavlov |
| dirs | 6.0.0 | MIT OR Apache-2.0 | Copyright 2018-2019 dirs-rs contributors |
| dirs-sys | 0.5.0 | MIT OR Apache-2.0 | Copyright 2018-2019 dirs-rs contributors |
| dispatch2 | 0.3.1 | Zlib OR Apache-2.0 OR MIT | — |
| displaydoc | 0.2.6 | MIT OR Apache-2.0 | — |
| dlopen2 | 0.8.2 | MIT | — |
| dlopen2_derive | 0.4.3 | MIT | — |
| dom_query | 0.27.0 | MIT | Copyright 2023 Mykola Humanov |
| downcast-rs | 1.2.1 | MIT/Apache-2.0 | Copyright 2020 Ashish Myles and contributors |
| dpi | 0.1.2 | Apache-2.0 AND MIT | Copyright 2018 Jorge Aparicio |
| dtoa | 1.0.11 | MIT OR Apache-2.0 | — |
| dtoa-short | 0.3.5 | MPL-2.0 | — |
| dtor | 0.3.0 | Apache-2.0 OR MIT | — |
| dtor-proc-macro | 0.0.6 | Apache-2.0 OR MIT | — |
| dunce | 1.0.5 | CC0-1.0 OR MIT-0 OR Apache-2.0 | — |
| dyn-clone | 1.0.20 | MIT OR Apache-2.0 | — |
| embed_plist | 1.2.2 | MIT OR Apache-2.0 | Copyright 2020 Nikolai Vazquez |
| embed-resource | 3.0.11 | MIT | Copyright 2017 nabijaczleweli |
| endi | 1.1.1 | MIT | — |
| enumflags2 | 0.7.12 | MIT OR Apache-2.0 | Copyright 2017-2023 Maik Klein, Maja Kądziołka |
| enumflags2_derive | 0.7.12 | MIT OR Apache-2.0 | Copyright 2017 Maik Klein |
| equivalent | 1.0.2 | Apache-2.0 OR MIT | Copyright 2016--2023 |
| erased-serde | 0.4.10 | MIT OR Apache-2.0 | — |
| errno | 0.3.14 | MIT OR Apache-2.0 | Copyright 2014 Chris Wong |
| event-listener | 5.4.1 | Apache-2.0 OR MIT | — |
| event-listener-strategy | 0.5.4 | Apache-2.0 OR MIT | — |
| fastrand | 2.5.0 | Apache-2.0 OR MIT | — |
| fdeflate | 0.3.7 | MIT OR Apache-2.0 | — |
| field-offset | 0.3.6 | MIT OR Apache-2.0 | Copyright 2016-2021 Diggory Blake, and other contributors |
| filedescriptor | 0.8.3 | MIT | Copyright 2018 Wez Furlong |
| filetime | 0.2.29 | MIT/Apache-2.0 | Copyright 2014 Alex Crichton |
| find-msvc-tools | 0.1.9 | MIT OR Apache-2.0 | Copyright 2014 Alex Crichton |
| flate2 | 1.1.9 | MIT OR Apache-2.0 | Copyright 2014-2026 Alex Crichton |
| fnv | 1.0.7 | Apache-2.0 / MIT | Copyright 2017 Contributors |
| foldhash | 0.2.0 | Zlib | Copyright 2024 Orson Peters |
| foreign-types | 0.5.0 | MIT/Apache-2.0 | Copyright 2017 The foreign-types Developers |
| foreign-types-macros | 0.2.4 | MIT/Apache-2.0 | Copyright 2017 The foreign-types Developers |
| foreign-types-shared | 0.3.1 | MIT/Apache-2.0 | Copyright 2017 The foreign-types Developers |
| form_urlencoded | 1.2.2 | MIT OR Apache-2.0 | Copyright 2013-2016 The rust-url developers |
| fs_extra | 1.3.0 | MIT | Copyright 2017 Denis Kurilenko |
| futures-channel | 0.3.33 | MIT OR Apache-2.0 | Copyright 2016 Alex Crichton |
| futures-core | 0.3.33 | MIT OR Apache-2.0 | Copyright 2016 Alex Crichton |
| futures-executor | 0.3.33 | MIT OR Apache-2.0 | Copyright 2016 Alex Crichton |
| futures-io | 0.3.33 | MIT OR Apache-2.0 | Copyright 2016 Alex Crichton |
| futures-lite | 2.6.1 | Apache-2.0 OR MIT | Copyright 2016 Alex Crichton |
| futures-macro | 0.3.33 | MIT OR Apache-2.0 | Copyright 2016 Alex Crichton |
| futures-sink | 0.3.33 | MIT OR Apache-2.0 | Copyright 2016 Alex Crichton |
| futures-task | 0.3.33 | MIT OR Apache-2.0 | Copyright 2016 Alex Crichton |
| futures-util | 0.3.33 | MIT OR Apache-2.0 | Copyright 2016 Alex Crichton |
| gdk | 0.18.2 | MIT | — |
| gdk-pixbuf | 0.18.5 | MIT | — |
| gdk-pixbuf-sys | 0.18.0 | MIT | — |
| gdk-sys | 0.18.2 | MIT | — |
| gdkwayland-sys | 0.18.2 | MIT | — |
| gdkx11 | 0.18.2 | MIT | — |
| gdkx11-sys | 0.18.2 | MIT | — |
| generic-array | 0.14.7 | MIT | Copyright 2015 Bartłomiej Kamiński |
| getrandom | 0.2.17 | MIT OR Apache-2.0 | Copyright 2018-2024 The rust-random Project Developers |
| getrandom | 0.3.4 | MIT OR Apache-2.0 | Copyright 2018-2025 The rust-random Project Developers |
| getrandom | 0.4.3 | MIT OR Apache-2.0 | Copyright 2018-2026 The rust-random Project Developers |
| gio | 0.18.4 | MIT | — |
| gio-sys | 0.18.1 | MIT | — |
| glib | 0.18.5 | MIT | — |
| glib-macros | 0.18.5 | MIT | — |
| glib-sys | 0.18.1 | MIT | — |
| glob | 0.3.4 | MIT OR Apache-2.0 | Copyright 2014 The Rust Project Developers |
| gobject-sys | 0.18.0 | MIT | — |
| gtk | 0.18.2 | MIT | — |
| gtk-sys | 0.18.2 | MIT | — |
| gtk3-macros | 0.18.2 | MIT | — |
| hashbrown | 0.12.3 | MIT OR Apache-2.0 | Copyright 2016 Amanieu d'Antras |
| hashbrown | 0.17.1 | MIT OR Apache-2.0 | Copyright 2016 Amanieu d'Antras |
| heck | 0.4.1 | MIT OR Apache-2.0 | Copyright 2015 The Rust Project Developers |
| heck | 0.5.0 | MIT OR Apache-2.0 | Copyright 2015 The Rust Project Developers |
| hermit-abi | 0.5.2 | MIT OR Apache-2.0 | — |
| hex | 0.4.3 | MIT OR Apache-2.0 | Copyright 2013-2014 The Rust Project Developers |
| html5ever | 0.38.0 | MIT OR Apache-2.0 | Copyright 2014 The html5ever Project Developers |
| http | 1.4.2 | MIT OR Apache-2.0 | Copyright 2017 http-rs authors |
| http-body | 1.1.0 | MIT | Copyright 2019-2026 Sean McArthur & Hyper Contributors |
| http-body-util | 0.1.4 | MIT | Copyright 2019-2026 Sean McArthur & Hyper Contributors |
| http-range | 0.1.5 | MIT | Copyright 2016 Luka Zakrajšek |
| httparse | 1.10.1 | MIT OR Apache-2.0 | Copyright 2015-2025 Sean McArthur |
| hyper | 1.11.0 | MIT | Copyright 2014-2026 Sean McArthur |
| hyper-rustls | 0.27.9 | Apache-2.0 OR ISC OR MIT | Copyright 2016, Joseph Birr-Pixton <jpixton@gmail.com> |
| hyper-util | 0.1.20 | MIT | Copyright 2023-2025 Sean McArthur |
| iana-time-zone | 0.1.65 | MIT OR Apache-2.0 | Copyright 2020 Andrew D. Straw |
| iana-time-zone-haiku | 0.1.2 | MIT OR Apache-2.0 | Copyright 2020 Andrew D. Straw |
| ico | 0.5.0 | MIT | Copyright 2018 Matthew D. Steele |
| icu_collections | 2.2.0 | Unicode-3.0 | Copyright 2020-2024 Unicode, Inc |
| icu_locale_core | 2.2.0 | Unicode-3.0 | Copyright 2020-2024 Unicode, Inc |
| icu_normalizer | 2.2.0 | Unicode-3.0 | Copyright 2020-2024 Unicode, Inc |
| icu_normalizer_data | 2.2.0 | Unicode-3.0 | Copyright 2020-2024 Unicode, Inc |
| icu_properties | 2.2.0 | Unicode-3.0 | Copyright 2020-2024 Unicode, Inc |
| icu_properties_data | 2.2.0 | Unicode-3.0 | Copyright 2020-2024 Unicode, Inc |
| icu_provider | 2.2.0 | Unicode-3.0 | Copyright 2020-2024 Unicode, Inc |
| ident_case | 1.0.1 | MIT/Apache-2.0 | — |
| idna | 1.1.0 | MIT OR Apache-2.0 | Copyright 2013-2025 The rust-url developers |
| idna_adapter | 1.2.2 | Apache-2.0 OR MIT | — |
| indexmap | 1.9.3 | Apache-2.0 OR MIT | Copyright 2016--2017 |
| indexmap | 2.14.0 | Apache-2.0 OR MIT | Copyright 2016--2017 |
| infer | 0.19.0 | MIT | Copyright 2019 Bojan |
| ipnet | 2.12.0 | MIT OR Apache-2.0 | Copyright 2017 Juniper Networks, Inc |
| is-docker | 0.2.0 | MIT | Copyright 2023 Sean Larkin |
| is-wsl | 0.4.0 | MIT | Copyright 2023 Sean Larkin |
| itoa | 1.0.18 | MIT OR Apache-2.0 | — |
| javascriptcore-rs | 1.1.2 | MIT | Copyright 2013-2021, The Gtk-rs Project Developers |
| javascriptcore-rs-sys | 1.1.1 | MIT | Copyright 2013-2017, The Gtk-rs Project Developers |
| jni | 0.21.1 | MIT/Apache-2.0 | Copyright 2016 Prevoty, Inc. and jni-rs contributors |
| jni | 0.22.4 | MIT OR Apache-2.0 | — |
| jni-macros | 0.22.4 | MIT OR Apache-2.0 | — |
| jni-sys | 0.3.1 | MIT OR Apache-2.0 | Copyright 2015 The rust-jni-sys Developers |
| jni-sys | 0.4.1 | MIT OR Apache-2.0 | Copyright 2015 The rust-jni-sys Developers |
| jni-sys-macros | 0.4.1 | MIT OR Apache-2.0 | — |
| jobserver | 0.1.35 | MIT OR Apache-2.0 | Copyright 2014 Alex Crichton |
| js-sys | 0.3.103 | MIT OR Apache-2.0 | Copyright 2014 Alex Crichton |
| json-patch | 3.0.1 | MIT/Apache-2.0 | Copyright 2017 Ivan Dubrov |
| jsonptr | 0.6.3 | MIT OR Apache-2.0 | Copyright 2022 Chance Dinkins |
| keyboard-types | 0.7.0 | MIT OR Apache-2.0 | Copyright 2017 Pyfisch |
| lazy_static | 1.5.0 | MIT OR Apache-2.0 | Copyright 2010 The Rust Project Developers |
| libappindicator | 0.9.0 | Apache-2.0 OR MIT | Copyright 2017-2021 qDot |
| libappindicator-sys | 0.9.0 | Apache-2.0 OR MIT | — |
| libc | 0.2.189 | MIT OR Apache-2.0 | — |
| libdbus-sys | 0.2.7 | Apache-2.0/MIT | Copyright 2014-2018 David Henningsson <diwic@ubuntu.com> and other contributors |
| libloading | 0.7.4 | ISC | Copyright 2015, Simonas Kazlauskas |
| libredox | 0.1.18 | MIT | Copyright 2023 4lDO2 |
| linux-raw-sys | 0.12.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | — |
| litemap | 0.8.2 | Unicode-3.0 | Copyright 2020-2024 Unicode, Inc |
| lock_api | 0.4.14 | MIT OR Apache-2.0 | Copyright 2016 The Rust Project Developers |
| log | 0.4.33 | MIT OR Apache-2.0 | Copyright 2014 The Rust Project Developers |
| lru-slab | 0.1.2 | MIT OR Apache-2.0 OR Zlib | Copyright 2024 The lru-slab Developers |
| mac-notification-sys | 0.6.15 | MIT/Apache-2.0 | — |
| markup5ever | 0.38.0 | MIT OR Apache-2.0 | Copyright 2014 The html5ever Project Developers |
| memchr | 2.8.3 | Unlicense OR MIT | Copyright 2015 Andrew Gallant |
| memoffset | 0.9.1 | MIT | Copyright 2017 Gilad Naaman |
| mime | 0.3.17 | MIT OR Apache-2.0 | Copyright 2014 Sean McArthur |
| minisign-verify | 0.2.5 | MIT | Copyright 2019-2025 Frank Denis |
| miniz_oxide | 0.8.9 | MIT OR Zlib OR Apache-2.0 | Copyright 2013-2014 RAD Game Tools and Valve Software |
| mio | 1.2.2 | MIT | Copyright 2014 Carl Lerche and other MIO contributors |
| muda | 0.19.3 | Apache-2.0 OR MIT | Copyright 2022-2022 Tauri Programme within The Commons Conservancy |
| ndk | 0.9.0 | MIT OR Apache-2.0 | — |
| ndk-sys | 0.6.0+11769913 | MIT OR Apache-2.0 | — |
| new_debug_unreachable | 1.0.6 | MIT | Copyright 2015 Jonathan Reem |
| nix | 0.28.0 | MIT | Copyright 2015 Carl Lerche + nix-rust Authors |
| nix | 0.31.3 | MIT | Copyright 2015 Carl Lerche + nix-rust Authors |
| notify-rust | 4.18.0 | MIT OR Apache-2.0 | Copyright 2017 Hendrik Sollich |
| num_enum | 0.7.6 | BSD-3-Clause OR MIT OR Apache-2.0 | Copyright 2018, Daniel Wagner-Hall |
| num_enum_derive | 0.7.6 | BSD-3-Clause OR MIT OR Apache-2.0 | Copyright 2018, Daniel Wagner-Hall |
| num-conv | 0.2.2 | MIT OR Apache-2.0 | — |
| num-traits | 0.2.19 | MIT OR Apache-2.0 | Copyright 2014 The Rust Project Developers |
| objc2 | 0.6.4 | MIT | — |
| objc2-app-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT | — |
| objc2-cloud-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT | — |
| objc2-core-data | 0.3.2 | Zlib OR Apache-2.0 OR MIT | — |
| objc2-core-foundation | 0.3.2 | Zlib OR Apache-2.0 OR MIT | — |
| objc2-core-graphics | 0.3.2 | Zlib OR Apache-2.0 OR MIT | — |
| objc2-core-image | 0.3.2 | Zlib OR Apache-2.0 OR MIT | — |
| objc2-core-location | 0.3.2 | Zlib OR Apache-2.0 OR MIT | — |
| objc2-core-text | 0.3.2 | Zlib OR Apache-2.0 OR MIT | — |
| objc2-encode | 4.1.0 | MIT | — |
| objc2-exception-helper | 0.1.1 | Zlib OR Apache-2.0 OR MIT | — |
| objc2-foundation | 0.3.2 | MIT | — |
| objc2-io-surface | 0.3.2 | Zlib OR Apache-2.0 OR MIT | — |
| objc2-osa-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT | — |
| objc2-quartz-core | 0.3.2 | Zlib OR Apache-2.0 OR MIT | — |
| objc2-security | 0.3.2 | Zlib OR Apache-2.0 OR MIT | — |
| objc2-service-management | 0.3.2 | Zlib OR Apache-2.0 OR MIT | — |
| objc2-ui-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT | — |
| objc2-user-notifications | 0.3.2 | Zlib OR Apache-2.0 OR MIT | — |
| objc2-web-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT | — |
| once_cell | 1.21.4 | MIT OR Apache-2.0 | — |
| open | 5.4.0 | MIT | Copyright `2015` `Sebastian Thiel` |
| openssl-probe | 0.2.1 | MIT OR Apache-2.0 | Copyright 2014 Alex Crichton |
| option-ext | 0.2.0 | MPL-2.0 | — |
| ordered-stream | 0.2.0 | MIT OR Apache-2.0 | — |
| os_info | 3.15.0 | MIT | Copyright 2017 Stanislav Tkach |
| osakit | 0.3.1 | MIT OR Apache-2.0 | Copyright 2024 Marat Dulin |
| pango | 0.18.3 | MIT | — |
| pango-sys | 0.18.0 | MIT | — |
| parking | 2.2.1 | Apache-2.0 OR MIT | Copyright 2014-2020 The Rust Project Developers |
| parking_lot | 0.12.5 | MIT OR Apache-2.0 | Copyright 2016 The Rust Project Developers |
| parking_lot_core | 0.9.12 | MIT OR Apache-2.0 | Copyright 2016 The Rust Project Developers |
| percent-encoding | 2.3.2 | MIT OR Apache-2.0 | Copyright 2013-2025 The rust-url developers |
| phf | 0.13.1 | MIT | Copyright 2014-2022 Steven Fackler, Yuki Okushi |
| phf_codegen | 0.13.1 | MIT | Copyright 2014-2022 Steven Fackler, Yuki Okushi |
| phf_generator | 0.13.1 | MIT | Copyright 2014-2022 Steven Fackler, Yuki Okushi |
| phf_macros | 0.13.1 | MIT | Copyright 2014-2022 Steven Fackler, Yuki Okushi |
| phf_shared | 0.13.1 | MIT | Copyright 2014-2022 Steven Fackler, Yuki Okushi |
| pin-project-lite | 0.2.17 | Apache-2.0 OR MIT | — |
| piper | 0.2.5 | MIT OR Apache-2.0 | — |
| pkg-config | 0.3.33 | MIT OR Apache-2.0 | Copyright 2014 Alex Crichton |
| plist | 1.10.0 | MIT | Copyright 2015 Edward Barnard |
| png | 0.17.16 | MIT OR Apache-2.0 | Copyright 2015 nwin |
| png | 0.18.1 | MIT OR Apache-2.0 | Copyright 2015 nwin |
| polling | 3.11.0 | Apache-2.0 OR MIT | — |
| portable-pty | 0.9.0 | MIT | Copyright 2018 Wez Furlong |
| potential_utf | 0.1.5 | Unicode-3.0 | Copyright 2020-2024 Unicode, Inc |
| powerfmt | 0.2.0 | MIT OR Apache-2.0 | Copyright 2023 Jacob Pratt et al |
| ppv-lite86 | 0.2.21 | MIT OR Apache-2.0 | Copyright 2019 The CryptoCorrosion Contributors |
| precomputed-hash | 0.1.1 | MIT | Copyright 2017 Emilio Cobos Álvarez |
| proc-macro-crate | 1.3.1 | MIT OR Apache-2.0 | — |
| proc-macro-crate | 2.0.2 | MIT OR Apache-2.0 | — |
| proc-macro-crate | 3.5.0 | MIT OR Apache-2.0 | — |
| proc-macro-error | 1.0.4 | MIT OR Apache-2.0 | Copyright 2019-2020 CreepySkeleton |
| proc-macro-error-attr | 1.0.4 | MIT OR Apache-2.0 | Copyright 2019-2020 CreepySkeleton |
| proc-macro2 | 1.0.107 | MIT OR Apache-2.0 | — |
| quick-xml | 0.41.0 | MIT | Copyright 2016 Johann Tuffe |
| quinn | 0.11.9 | MIT OR Apache-2.0 | Copyright 2018 The quinn Developers |
| quinn-proto | 0.11.14 | MIT OR Apache-2.0 | Copyright 2018 The quinn Developers |
| quinn-udp | 0.5.14 | MIT OR Apache-2.0 | Copyright 2018 The quinn Developers |
| quote | 1.0.47 | MIT OR Apache-2.0 | — |
| r-efi | 5.3.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later | — |
| r-efi | 6.0.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later | — |
| rand | 0.9.5 | MIT OR Apache-2.0 | Copyright 2018 Developers of the Rand project |
| rand_chacha | 0.9.0 | MIT OR Apache-2.0 | Copyright 2018 Developers of the Rand project |
| rand_core | 0.9.5 | MIT OR Apache-2.0 | Copyright 2018 Developers of the Rand project |
| raw-window-handle | 0.6.2 | MIT OR Apache-2.0 OR Zlib | Copyright 2019 Osspial |
| redox_syscall | 0.5.18 | MIT | Copyright 2017 Redox OS Developers |
| redox_users | 0.5.2 | MIT | Copyright 2017 Jose Narvaez |
| ref-cast | 1.0.26 | MIT OR Apache-2.0 | — |
| ref-cast-impl | 1.0.26 | MIT OR Apache-2.0 | — |
| regex | 1.13.1 | MIT OR Apache-2.0 | Copyright 2014 The Rust Project Developers |
| regex-automata | 0.4.16 | MIT OR Apache-2.0 | Copyright 2014 The Rust Project Developers |
| regex-syntax | 0.8.11 | MIT OR Apache-2.0 | Copyright 2014 The Rust Project Developers |
| reqwest | 0.13.4 | MIT OR Apache-2.0 | Copyright 2016-2026 Sean McArthur |
| rfd | 0.16.0 | MIT | Copyright 2022 Bartłomiej Maryńczak |
| ring | 0.17.14 | Apache-2.0 AND ISC | Copyright 2015-2025 Brian Smith |
| rustc_version | 0.4.1 | MIT OR Apache-2.0 | Copyright 2016 The Rust Project Developers |
| rustc-hash | 2.1.3 | Apache-2.0 OR MIT | — |
| rustix | 1.1.4 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | — |
| rustls | 0.23.42 | Apache-2.0 OR ISC OR MIT | Copyright 2016, Joseph Birr-Pixton <jpixton@gmail.com> |
| rustls-native-certs | 0.8.4 | Apache-2.0 OR ISC OR MIT | Copyright 2016, Joseph Birr-Pixton <jpixton@gmail.com> |
| rustls-pki-types | 1.15.1 | MIT OR Apache-2.0 | Copyright 2023 Dirkjan Ochtman <dirkjan@ochtman.nl> |
| rustls-platform-verifier | 0.7.0 | MIT OR Apache-2.0 | Copyright 2022 1Password |
| rustls-platform-verifier-android | 0.1.1 | MIT OR Apache-2.0 | — |
| rustls-webpki | 0.103.13 | ISC | Copyright 2015 Brian Smith |
| rustversion | 1.0.23 | MIT OR Apache-2.0 | — |
| same-file | 1.0.6 | Unlicense/MIT | Copyright 2017 Andrew Gallant |
| schannel | 0.1.29 | MIT | Copyright 2015 steffengy |
| schemars | 0.8.22 | MIT | Copyright 2019 Graham Esau |
| schemars | 0.9.0 | MIT | Copyright 2019 Graham Esau |
| schemars | 1.2.1 | MIT | Copyright 2019 Graham Esau |
| schemars_derive | 0.8.22 | MIT | Copyright 2019 Graham Esau |
| scopeguard | 1.2.0 | MIT OR Apache-2.0 | Copyright 2016-2019 Ulrik Sverdrup "bluss" and scopeguard developers |
| security-framework | 3.7.0 | MIT OR Apache-2.0 | Copyright 2015 Steven Fackler |
| security-framework-sys | 2.17.0 | MIT OR Apache-2.0 | Copyright 2015 Steven Fackler |
| selectors | 0.36.1 | MPL-2.0 | — |
| semver | 1.0.28 | MIT OR Apache-2.0 | — |
| serde | 1.0.229 | MIT OR Apache-2.0 | — |
| serde_core | 1.0.229 | MIT OR Apache-2.0 | — |
| serde_derive | 1.0.229 | MIT OR Apache-2.0 | — |
| serde_derive_internals | 0.29.1 | MIT OR Apache-2.0 | — |
| serde_json | 1.0.151 | MIT OR Apache-2.0 | — |
| serde_repr | 0.1.21 | MIT OR Apache-2.0 | — |
| serde_spanned | 0.6.9 | MIT OR Apache-2.0 | — |
| serde_spanned | 1.1.1 | MIT OR Apache-2.0 | — |
| serde_with | 3.21.0 | MIT OR Apache-2.0 | Copyright 2015 |
| serde_with_macros | 3.21.0 | MIT OR Apache-2.0 | Copyright 2015 |
| serde-untagged | 0.1.9 | MIT OR Apache-2.0 | — |
| serial2 | 0.2.37 | BSD-2-Clause OR Apache-2.0 | Copyright 2021, Maarten de Vries <maarten@de-vri.es> |
| serialize-to-javascript | 0.1.2 | MIT OR Apache-2.0 | Copyright 2021 Chip Reed |
| serialize-to-javascript-impl | 0.1.2 | MIT OR Apache-2.0 | Copyright 2021 Chip Reed |
| servo_arc | 0.4.3 | MIT OR Apache-2.0 | — |
| sha2 | 0.10.9 | MIT OR Apache-2.0 | Copyright 2006-2009 Graydon Hoare |
| shared_library | 0.1.9 | Apache-2.0/MIT | Copyright 2017 Pierre Krieger |
| shell-words | 1.1.1 | MIT/Apache-2.0 | Copyright 2016 Tomasz Miąsko |
| shlex | 2.0.1 | MIT OR Apache-2.0 | Copyright 2015 Nicholas Allegra (comex) |
| signal-hook-registry | 1.4.8 | MIT OR Apache-2.0 | Copyright 2017 tokio-jsonrpc developers |
| simd_cesu8 | 1.2.0 | Apache-2.0 OR MIT | — |
| simd-adler32 | 0.3.10 | MIT | Copyright [2021] [Marvin Countryman] |
| simdutf8 | 0.1.5 | MIT OR Apache-2.0 | — |
| siphasher | 1.0.3 | MIT/Apache-2.0 | Copyright 2012-2016 The Rust Project Developers |
| slab | 0.4.12 | MIT | Copyright 2019 Carl Lerche |
| smallvec | 1.15.2 | MIT OR Apache-2.0 | Copyright 2018 The Servo Project Developers |
| smappservice-rs | 0.1.3 | MIT | Copyright 2025 iparaskev |
| socket2 | 0.6.5 | MIT OR Apache-2.0 | Copyright 2014 Alex Crichton |
| softbuffer | 0.4.8 | MIT OR Apache-2.0 | Copyright 2022 Kirill Chibisov |
| soup3 | 0.5.0 | MIT | Copyright 2013-2017, The Gtk-rs Project Developers |
| soup3-sys | 0.5.0 | MIT | Copyright 2013-2017, The Gtk-rs Project Developers |
| stable_deref_trait | 1.2.1 | MIT OR Apache-2.0 | Copyright 2017 Robert Grosse |
| string_cache | 0.9.0 | MIT OR Apache-2.0 | Copyright 2012-2013 Mozilla Foundation |
| string_cache_codegen | 0.6.1 | MIT OR Apache-2.0 | Copyright 2012-2013 Mozilla Foundation |
| strsim | 0.11.1 | MIT | Copyright 2015 Danny Guo |
| subtle | 2.6.1 | BSD-3-Clause | Copyright 2016-2017 Isis Agora Lovecruft, Henry de Valence. All rights reserved |
| swift-rs | 1.0.7 | MIT OR Apache-2.0 | Copyright 2023 The swift-rs Developers |
| syn | 1.0.109 | MIT OR Apache-2.0 | — |
| syn | 2.0.119 | MIT OR Apache-2.0 | — |
| syn | 3.0.3 | MIT OR Apache-2.0 | — |
| sync_wrapper | 1.0.2 | Apache-2.0 | — |
| synstructure | 0.13.2 | MIT | Copyright 2016 Nika Layzell |
| system-deps | 6.2.2 | MIT OR Apache-2.0 | — |
| tao | 0.35.3 | Apache-2.0 | Copyright Text: 2021-2023, The Tauri Programme in the Commons Conservancy |
| tao-macros | 0.1.3 | MIT OR Apache-2.0 | — |
| tar | 0.4.46 | MIT OR Apache-2.0 | — |
| target-lexicon | 0.12.16 | Apache-2.0 WITH LLVM-exception | — |
| tauri | 2.11.5 | Apache-2.0 OR MIT | Copyright 2017 - Present Tauri Apps Contributors |
| tauri-build | 2.6.3 | Apache-2.0 OR MIT | Copyright 2017 - Present Tauri Apps Contributors |
| tauri-codegen | 2.6.3 | Apache-2.0 OR MIT | Copyright 2017 - Present Tauri Apps Contributors |
| tauri-macros | 2.6.3 | Apache-2.0 OR MIT | Copyright 2017 - Present Tauri Apps Contributors |
| tauri-plugin | 2.6.3 | Apache-2.0 OR MIT | — |
| tauri-plugin-dialog | 2.7.2 | Apache-2.0 OR MIT | Copyright Text: 2019-2022, The Tauri Programme in the Commons Conservancy |
| tauri-plugin-fs | 2.5.1 | Apache-2.0 OR MIT | Copyright Text: 2019-2022, The Tauri Programme in the Commons Conservancy |
| tauri-plugin-notification | 2.3.3 | Apache-2.0 OR MIT | Copyright Text: 2019-2022, The Tauri Programme in the Commons Conservancy |
| tauri-plugin-opener | 2.5.4 | Apache-2.0 OR MIT | Copyright Text: 2019-2022, The Tauri Programme in the Commons Conservancy |
| tauri-plugin-process | 2.3.1 | Apache-2.0 OR MIT | Copyright Text: 2019-2022, The Tauri Programme in the Commons Conservancy |
| tauri-plugin-single-instance | 2.4.3 | Apache-2.0 OR MIT | Copyright Text: 2019-2022, The Tauri Programme in the Commons Conservancy |
| tauri-plugin-updater | 2.10.1 | Apache-2.0 OR MIT | Copyright Text: 2019-2022, The Tauri Programme in the Commons Conservancy |
| tauri-runtime | 2.11.3 | Apache-2.0 OR MIT | Copyright 2017 - Present Tauri Apps Contributors |
| tauri-runtime-wry | 2.11.4 | Apache-2.0 OR MIT | Copyright 2017 - Present Tauri Apps Contributors |
| tauri-utils | 2.9.3 | Apache-2.0 OR MIT | Copyright 2017 - Present Tauri Apps Contributors |
| tauri-winres | 0.3.6 | MIT | Copyright 2023 - Present Tauri Apps Contributors |
| tauri-winrt-notification | 0.7.3 | MIT OR Apache-2.0 | Copyright Text: 2022-2022, The Tauri Programme in the Commons Conservancy |
| tempfile | 3.27.0 | MIT OR Apache-2.0 | Copyright 2015 Steven Allen |
| tendril | 0.5.1 | MIT OR Apache-2.0 | Copyright 2015 Keegan McAllister |
| thiserror | 1.0.69 | MIT OR Apache-2.0 | — |
| thiserror | 2.0.19 | MIT OR Apache-2.0 | — |
| thiserror-impl | 1.0.69 | MIT OR Apache-2.0 | — |
| thiserror-impl | 2.0.19 | MIT OR Apache-2.0 | — |
| time | 0.3.54 | MIT OR Apache-2.0 | — |
| time-core | 0.1.9 | MIT OR Apache-2.0 | — |
| time-macros | 0.2.32 | MIT OR Apache-2.0 | — |
| tinystr | 0.8.3 | Unicode-3.0 | Copyright 2020-2024 Unicode, Inc |
| tinyvec | 1.12.0 | Zlib OR Apache-2.0 OR MIT | Copyright 2019 Daniel "Lokathor" Gee |
| tinyvec_macros | 0.1.1 | MIT OR Apache-2.0 OR Zlib | Copyright 2020 Soveu |
| tokio | 1.53.1 | MIT | — |
| tokio-rustls | 0.26.4 | MIT OR Apache-2.0 | Copyright 2017 quininer kel |
| tokio-util | 0.7.19 | MIT | — |
| toml | 0.8.2 | MIT OR Apache-2.0 | — |
| toml | 0.9.12+spec-1.1.0 | MIT OR Apache-2.0 | — |
| toml | 1.1.3+spec-1.1.0 | MIT OR Apache-2.0 | — |
| toml_datetime | 0.6.3 | MIT OR Apache-2.0 | Copyright 2014 Alex Crichton |
| toml_datetime | 0.7.5+spec-1.1.0 | MIT OR Apache-2.0 | — |
| toml_datetime | 1.1.1+spec-1.1.0 | MIT OR Apache-2.0 | — |
| toml_edit | 0.19.15 | MIT OR Apache-2.0 | — |
| toml_edit | 0.20.2 | MIT OR Apache-2.0 | — |
| toml_edit | 0.25.13+spec-1.1.0 | MIT OR Apache-2.0 | — |
| toml_parser | 1.1.2+spec-1.1.0 | MIT OR Apache-2.0 | — |
| toml_writer | 1.1.2+spec-1.1.0 | MIT OR Apache-2.0 | — |
| tower | 0.5.3 | MIT | Copyright 2019 Tower Contributors |
| tower-http | 0.6.11 | MIT | Copyright 2019-2021 Tower Contributors |
| tower-layer | 0.3.3 | MIT | Copyright 2019 Tower Contributors |
| tower-service | 0.3.3 | MIT | Copyright 2019 Tower Contributors |
| tracing | 0.1.44 | MIT | Copyright 2019 Tokio Contributors |
| tracing-attributes | 0.1.31 | MIT | Copyright 2019 Tokio Contributors |
| tracing-core | 0.1.36 | MIT | Copyright 2019 Tokio Contributors |
| tray-icon | 0.24.1 | MIT OR Apache-2.0 | Copyright 2022-2022 Tauri Programme within The Commons Conservancy |
| try-lock | 0.2.5 | MIT | Copyright 2018-2023 Sean McArthur |
| typeid | 1.0.3 | MIT OR Apache-2.0 | — |
| typenum | 1.20.1 | MIT OR Apache-2.0 | Copyright 2014 Paho Lurie-Gregg |
| uds_windows | 1.2.1 | MIT | — |
| unic-char-property | 0.9.0 | MIT/Apache-2.0 | — |
| unic-char-range | 0.9.0 | MIT/Apache-2.0 | — |
| unic-common | 0.9.0 | MIT/Apache-2.0 | — |
| unic-ucd-ident | 0.9.0 | MIT/Apache-2.0 | — |
| unic-ucd-version | 0.9.0 | MIT/Apache-2.0 | — |
| unicode-ident | 1.0.24 | (MIT OR Apache-2.0) AND Unicode-3.0 | Copyright 1991-2023 Unicode, Inc |
| unicode-segmentation | 1.13.3 | MIT OR Apache-2.0 | Copyright 2015 The Rust Project Developers |
| untrusted | 0.9.0 | ISC | Copyright 2015-2016 Brian Smith |
| url | 2.5.8 | MIT OR Apache-2.0 | Copyright 2013-2025 The rust-url developers |
| urlpattern | 0.3.0 | MIT | Copyright 2021 the Deno authors |
| utf8_iter | 1.0.4 | Apache-2.0 OR MIT | — |
| uuid | 1.24.0 | Apache-2.0 OR MIT | Copyright 2014 The Rust Project Developers |
| version_check | 0.9.5 | MIT/Apache-2.0 | Copyright 2017-2018 Sergio Benitez |
| version-compare | 0.2.1 | MIT | Copyright 2017 Tim Visée |
| vswhom | 0.1.0 | MIT | Copyright 2019 nabijaczleweli |
| vswhom-sys | 0.1.3 | MIT | Copyright 2019 nabijaczleweli |
| walkdir | 2.5.0 | Unlicense/MIT | Copyright 2015 Andrew Gallant |
| want | 0.3.1 | MIT | Copyright 2018-2019 Sean McArthur |
| wasi | 0.11.1+wasi-snapshot-preview1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | — |
| wasip2 | 1.0.4+wasi-0.2.12 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | — |
| wasm-bindgen | 0.2.126 | MIT OR Apache-2.0 | Copyright 2014 Alex Crichton |
| wasm-bindgen-futures | 0.4.76 | MIT OR Apache-2.0 | Copyright 2014 Alex Crichton |
| wasm-bindgen-macro | 0.2.126 | MIT OR Apache-2.0 | Copyright 2014 Alex Crichton |
| wasm-bindgen-macro-support | 0.2.126 | MIT OR Apache-2.0 | Copyright 2014 Alex Crichton |
| wasm-bindgen-shared | 0.2.126 | MIT OR Apache-2.0 | Copyright 2014 Alex Crichton |
| wasm-streams | 0.5.0 | MIT OR Apache-2.0 | — |
| web_atoms | 0.2.5 | MIT OR Apache-2.0 | Copyright 2014 The html5ever Project Developers |
| web-sys | 0.3.103 | MIT OR Apache-2.0 | Copyright 2014 Alex Crichton |
| web-time | 1.1.0 | MIT OR Apache-2.0 | Copyright 2023 dAxpeDDa |
| webkit2gtk | 2.0.2 | MIT | Copyright 2016 Boucher, Antoni <bouanto@zoho.com> |
| webkit2gtk-sys | 2.0.2 | MIT | Copyright 2016 Boucher, Antoni <bouanto@zoho.com> |
| webpki-root-certs | 1.0.9 | CDLA-Permissive-2.0 | — |
| webview2-com | 0.38.2 | MIT | — |
| webview2-com-macros | 0.8.1 | MIT | — |
| webview2-com-sys | 0.38.2 | MIT | — |
| winapi | 0.3.9 | MIT/Apache-2.0 | Copyright 2015-2018 The winapi-rs Developers |
| winapi-i686-pc-windows-gnu | 0.4.0 | MIT/Apache-2.0 | — |
| winapi-util | 0.1.11 | Unlicense OR MIT | Copyright 2017 Andrew Gallant |
| winapi-x86_64-pc-windows-gnu | 0.4.0 | MIT/Apache-2.0 | — |
| window-vibrancy | 0.6.0 | Apache-2.0 OR MIT | Copyright 2020-2022 Tauri Programme within The Commons Conservancy |
| windows | 0.61.3 | MIT OR Apache-2.0 | — |
| windows | 0.62.2 | MIT OR Apache-2.0 | — |
| windows_aarch64_gnullvm | 0.42.2 | MIT OR Apache-2.0 | — |
| windows_aarch64_gnullvm | 0.52.6 | MIT OR Apache-2.0 | — |
| windows_aarch64_gnullvm | 0.53.1 | MIT OR Apache-2.0 | — |
| windows_aarch64_msvc | 0.42.2 | MIT OR Apache-2.0 | — |
| windows_aarch64_msvc | 0.52.6 | MIT OR Apache-2.0 | — |
| windows_aarch64_msvc | 0.53.1 | MIT OR Apache-2.0 | — |
| windows_i686_gnu | 0.42.2 | MIT OR Apache-2.0 | — |
| windows_i686_gnu | 0.52.6 | MIT OR Apache-2.0 | — |
| windows_i686_gnu | 0.53.1 | MIT OR Apache-2.0 | — |
| windows_i686_gnullvm | 0.52.6 | MIT OR Apache-2.0 | — |
| windows_i686_gnullvm | 0.53.1 | MIT OR Apache-2.0 | — |
| windows_i686_msvc | 0.42.2 | MIT OR Apache-2.0 | — |
| windows_i686_msvc | 0.52.6 | MIT OR Apache-2.0 | — |
| windows_i686_msvc | 0.53.1 | MIT OR Apache-2.0 | — |
| windows_x86_64_gnu | 0.42.2 | MIT OR Apache-2.0 | — |
| windows_x86_64_gnu | 0.52.6 | MIT OR Apache-2.0 | — |
| windows_x86_64_gnu | 0.53.1 | MIT OR Apache-2.0 | — |
| windows_x86_64_gnullvm | 0.42.2 | MIT OR Apache-2.0 | — |
| windows_x86_64_gnullvm | 0.52.6 | MIT OR Apache-2.0 | — |
| windows_x86_64_gnullvm | 0.53.1 | MIT OR Apache-2.0 | — |
| windows_x86_64_msvc | 0.42.2 | MIT OR Apache-2.0 | — |
| windows_x86_64_msvc | 0.52.6 | MIT OR Apache-2.0 | — |
| windows_x86_64_msvc | 0.53.1 | MIT OR Apache-2.0 | — |
| windows-collections | 0.2.0 | MIT OR Apache-2.0 | — |
| windows-collections | 0.3.2 | MIT OR Apache-2.0 | — |
| windows-core | 0.61.2 | MIT OR Apache-2.0 | — |
| windows-core | 0.62.2 | MIT OR Apache-2.0 | — |
| windows-future | 0.2.1 | MIT OR Apache-2.0 | — |
| windows-future | 0.3.2 | MIT OR Apache-2.0 | — |
| windows-implement | 0.60.2 | MIT OR Apache-2.0 | — |
| windows-interface | 0.59.3 | MIT OR Apache-2.0 | — |
| windows-link | 0.1.3 | MIT OR Apache-2.0 | — |
| windows-link | 0.2.1 | MIT OR Apache-2.0 | — |
| windows-numerics | 0.2.0 | MIT OR Apache-2.0 | — |
| windows-numerics | 0.3.1 | MIT OR Apache-2.0 | — |
| windows-registry | 0.6.1 | MIT OR Apache-2.0 | — |
| windows-result | 0.3.4 | MIT OR Apache-2.0 | — |
| windows-result | 0.4.1 | MIT OR Apache-2.0 | — |
| windows-strings | 0.4.2 | MIT OR Apache-2.0 | — |
| windows-strings | 0.5.1 | MIT OR Apache-2.0 | — |
| windows-sys | 0.45.0 | MIT OR Apache-2.0 | — |
| windows-sys | 0.52.0 | MIT OR Apache-2.0 | — |
| windows-sys | 0.59.0 | MIT OR Apache-2.0 | — |
| windows-sys | 0.60.2 | MIT OR Apache-2.0 | — |
| windows-sys | 0.61.2 | MIT OR Apache-2.0 | — |
| windows-targets | 0.42.2 | MIT OR Apache-2.0 | — |
| windows-targets | 0.52.6 | MIT OR Apache-2.0 | — |
| windows-targets | 0.53.5 | MIT OR Apache-2.0 | — |
| windows-threading | 0.1.0 | MIT OR Apache-2.0 | — |
| windows-threading | 0.2.1 | MIT OR Apache-2.0 | — |
| windows-version | 0.1.7 | MIT OR Apache-2.0 | — |
| winnow | 0.5.40 | MIT | — |
| winnow | 0.7.15 | MIT | — |
| winnow | 1.0.4 | MIT | — |
| winreg | 0.10.1 | MIT | Copyright 2015 Igor Shaula |
| winreg | 0.55.0 | MIT | Copyright 2015 Igor Shaula |
| wit-bindgen | 0.57.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | — |
| writeable | 0.6.3 | Unicode-3.0 | Copyright 2020-2024 Unicode, Inc |
| wry | 0.55.1 | Apache-2.0 OR MIT | Copyright 2020-2023 Ngo Iok Ui & Tauri Programme within The Commons Conservancy |
| x11 | 2.21.0 | MIT | — |
| x11-dl | 2.21.0 | MIT | — |
| xattr | 1.6.1 | MIT OR Apache-2.0 | Copyright 2015 Steven Allen |
| yoke | 0.8.3 | Unicode-3.0 | Copyright 2020-2024 Unicode, Inc |
| yoke-derive | 0.8.2 | Unicode-3.0 | Copyright 2020-2024 Unicode, Inc |
| zbus | 5.18.0 | MIT | Copyright 2024 Zeeshan Ali Khan & zbus contributors |
| zbus_macros | 5.18.0 | MIT | Copyright 2024 Zeeshan Ali Khan & zbus contributors |
| zbus_names | 4.3.4 | MIT | Copyright 2024 Zeeshan Ali Khan & zbus contributors |
| zerocopy | 0.8.55 | BSD-2-Clause OR Apache-2.0 OR MIT | Copyright 2019 The Fuchsia Authors |
| zerocopy-derive | 0.8.55 | BSD-2-Clause OR Apache-2.0 OR MIT | Copyright 2019 The Fuchsia Authors |
| zerofrom | 0.1.8 | Unicode-3.0 | Copyright 2020-2024 Unicode, Inc |
| zerofrom-derive | 0.1.7 | Unicode-3.0 | Copyright 2020-2024 Unicode, Inc |
| zeroize | 1.9.0 | Apache-2.0 OR MIT | Copyright 2018-2026 The RustCrypto Project Developers |
| zerotrie | 0.2.4 | Unicode-3.0 | Copyright 2020-2024 Unicode, Inc |
| zerovec | 0.11.6 | Unicode-3.0 | Copyright 2020-2024 Unicode, Inc |
| zerovec-derive | 0.11.3 | Unicode-3.0 | Copyright 2020-2024 Unicode, Inc |
| zip | 4.6.1 | MIT | Copyright 2014 Mathijs van de Nes |
| zmij | 1.0.23 | MIT | — |
| zvariant | 5.13.1 | MIT | Copyright 2024 Zeeshan Ali Khan & zbus contributors |
| zvariant_derive | 5.13.1 | MIT | Copyright 2024 Zeeshan Ali Khan & zbus contributors |
| zvariant_utils | 3.5.0 | MIT | — |

---

Generado el 2026-07-31 a partir de `pnpm licenses list --prod`
y `cargo metadata`. Si eres autor de alguno de estos componentes y ves algo mal
atribuido, escribe y se corrige.
