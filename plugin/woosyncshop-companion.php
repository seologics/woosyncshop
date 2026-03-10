<?php
/**
 * Plugin Name: WooSyncShop Companion
 * Plugin URI:  https://woosyncshop.com
 * Description: Connects this WooCommerce store to the WooSyncShop platform. Handles hreflang injection for synced products and pages, and exposes a secure REST endpoint for configuration pushes.
 * Version:     1.1.0
 * Author:      WooSyncShop
 * Author URI:  https://woosyncshop.com
 * License:     GPL-2.0+
 * Text Domain: woosyncshop
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'WSS_VERSION',    '1.1.0' );
define( 'WSS_OPTION_KEY', 'woosyncshop_config' );
define( 'WSS_LOG_KEY',    'woosyncshop_log' );

// ─────────────────────────────────────────────────────────────────────────────
// 1.  BOOTSTRAP
// ─────────────────────────────────────────────────────────────────────────────

add_action( 'init', 'wss_init' );
function wss_init() {
    // REST routes are registered on rest_api_init
}

add_action( 'rest_api_init', 'wss_register_rest_routes' );
add_action( 'wp_head',       'wss_inject_hreflang', 1 );
add_action( 'admin_menu',    'wss_admin_menu' );
add_action( 'admin_init',    'wss_admin_settings' );
add_action( 'wp_ajax_wss_ping_test', 'wss_ajax_ping_test' );


// ─────────────────────────────────────────────────────────────────────────────
// 2.  REST API  –  Push configuration from the platform
// ─────────────────────────────────────────────────────────────────────────────
//
//  Endpoint:  POST /wp-json/woosyncshop/v1/config
//  Headers:   X-WSS-Token: <api_token stored in WP options>
//  Body (JSON):
//  {
//    "this_site_id": "shop-a",
//    "this_locale":  "nl_NL",
//    "connections": [
//      {
//        "site_id":  "shop-b",
//        "locale":   "fr_BE",
//        "base_url": "https://bamboehaag.be",
//        "mode":     "full"        // "full" | "inventory_only"
//      },
//      {
//        "site_id":  "shop-c",
//        "locale":   "nl_BE",
//        "base_url": "https://bamboehaag.be/nl",
//        "mode":     "inventory_only"   // ← no hreflang for this one
//      }
//    ],
//    "product_map": {
//      // keyed by THIS site's product ID (or SKU)
//      // value = array of { site_id, product_id, product_url }
//      // Only products present here get hreflang tags
//      "1234": [
//        { "site_id": "shop-b", "product_id": 5678, "product_url": "https://bamboehaag.be/fr/produit/bamboe-jumbo/" }
//      ],
//      "1235": [
//        { "site_id": "shop-b", "product_id": 5679, "product_url": "https://bamboehaag.be/fr/produit/bamboe-nitida/" }
//      ]
//    },
//    "page_map": {
//      // Same structure but for regular WP pages / WooCommerce pages
//      "45": [
//        { "site_id": "shop-b", "page_id": 99, "page_url": "https://bamboehaag.be/fr/a-propos/" }
//      ]
//    }
//  }
// ─────────────────────────────────────────────────────────────────────────────

function wss_register_rest_routes() {

    // Push config from platform → this site
    register_rest_route( 'woosyncshop/v1', '/config', [
        'methods'             => 'POST',
        'callback'            => 'wss_rest_receive_config',
        'permission_callback' => 'wss_rest_auth',
        'args'                => [
            'this_site_id' => [ 'required' => true, 'type' => 'string' ],
            'this_locale'  => [ 'required' => true, 'type' => 'string' ],
            'connections'  => [ 'required' => true, 'type' => 'array'  ],
            'product_map'  => [ 'required' => false, 'type' => 'object', 'default' => (object)[] ],
            'page_map'     => [ 'required' => false, 'type' => 'object', 'default' => (object)[] ],
        ],
    ] );

    // Health-check / handshake – used by platform when first connecting a site
    register_rest_route( 'woosyncshop/v1', '/ping', [
        'methods'             => 'GET',
        'callback'            => 'wss_rest_ping',
        'permission_callback' => 'wss_rest_auth',
    ] );

    // Platform pulls a report: which products exist, their IDs, SKUs, slugs
    register_rest_route( 'woosyncshop/v1', '/products-index', [
        'methods'             => 'GET',
        'callback'            => 'wss_rest_products_index',
        'permission_callback' => 'wss_rest_auth',
    ] );
}

// Auth: validate X-WSS-Token header against stored token
function wss_rest_auth( WP_REST_Request $request ) {
    $cfg   = wss_get_config();
    $token = $cfg['api_token'] ?? '';

    if ( empty( $token ) ) {
        return new WP_Error( 'wss_not_configured', 'WooSyncShop token not set.', [ 'status' => 503 ] );
    }

    $sent = $request->get_header( 'X-WSS-Token' );
    if ( ! hash_equals( $token, (string) $sent ) ) {
        return new WP_Error( 'wss_unauthorized', 'Invalid token.', [ 'status' => 401 ] );
    }

    return true;
}

function wss_rest_ping( WP_REST_Request $request ) {
    return new WP_REST_Response( [
        'status'  => 'ok',
        'version' => WSS_VERSION,
        'site'    => get_bloginfo( 'name' ),
        'url'     => get_site_url(),
        'wc'      => defined( 'WC_VERSION' ) ? WC_VERSION : null,
        'locale'  => get_locale(),
    ], 200 );
}

function wss_rest_receive_config( WP_REST_Request $request ) {
    $body = $request->get_json_params();

    $config = wss_get_config();

    // Merge new data into stored config, keep api_token intact
    $config['this_site_id'] = sanitize_text_field( $body['this_site_id'] ?? '' );
    $config['this_locale']  = sanitize_text_field( $body['this_locale']  ?? '' );
    $config['connections']  = wss_sanitize_connections( $body['connections'] ?? [] );
    $config['product_map']  = wss_sanitize_map( $body['product_map'] ?? [] );
    $config['page_map']     = wss_sanitize_map( $body['page_map']    ?? [] );
    $config['updated_at']   = current_time( 'c' );

    update_option( WSS_OPTION_KEY, $config, false );

    wss_log( 'Config updated by platform. Products mapped: ' . count( $config['product_map'] ) . ', pages mapped: ' . count( $config['page_map'] ) );

    return new WP_REST_Response( [ 'status' => 'ok', 'mapped_products' => count( $config['product_map'] ) ], 200 );
}

// Returns a lightweight index of all products: id, sku, slug, name
function wss_rest_products_index() {
    $args = [
        'post_type'      => 'product',
        'post_status'    => 'publish',
        'posts_per_page' => -1,
        'fields'         => 'ids',
    ];

    $ids  = get_posts( $args );
    $data = [];

    foreach ( $ids as $id ) {
        $product = wc_get_product( $id );
        if ( ! $product ) continue;
        $data[] = [
            'id'   => $id,
            'sku'  => $product->get_sku(),
            'slug' => $product->get_slug(),
            'name' => $product->get_name(),
            'type' => $product->get_type(),
            'url'  => get_permalink( $id ),
        ];
    }

    return new WP_REST_Response( $data, 200 );
}


// ─────────────────────────────────────────────────────────────────────────────
// 3.  HREFLANG INJECTION
// ─────────────────────────────────────────────────────────────────────────────
//
//  Logic:
//  - Only inject if current page is a singular product OR a mapped WP page
//  - Only inject tags for connections whose mode === "full"  (not "inventory_only")
//  - Always include x-default pointing to THIS site's URL
//  - THIS site's own hreflang tag always included
//  - Only products/pages present in the product_map / page_map get tags
// ─────────────────────────────────────────────────────────────────────────────

function wss_inject_hreflang() {
    $config = wss_get_config();

    // Plugin must be configured
    if ( empty( $config['this_locale'] ) || empty( $config['connections'] ) ) return;

    // Only inject on singular pages
    if ( ! is_singular() ) return;

    $post_id    = get_the_ID();
    $post_type  = get_post_type( $post_id );
    $current_url = get_permalink( $post_id );

    // ── Build target connections (only "full" mode) ────────────────────────
    $full_connections = array_filter( $config['connections'], function( $conn ) {
        return ( $conn['mode'] ?? 'full' ) === 'full';
    } );

    if ( empty( $full_connections ) ) return;

    // ── Determine which map to use ─────────────────────────────────────────
    $map = [];

    if ( $post_type === 'product' ) {
        // Products are mapped by product ID
        $map = $config['product_map'][ (string) $post_id ] ?? null;

        // Fallback: try mapping via SKU (in case IDs differ across sites)
        if ( $map === null ) {
            $product = wc_get_product( $post_id );
            if ( $product ) {
                $sku = $product->get_sku();
                if ( $sku ) {
                    $map = $config['product_map'][ 'sku:' . $sku ] ?? null;
                }
            }
        }
    } else {
        // Pages, posts, and WooCommerce special pages
        $map = $config['page_map'][ (string) $post_id ] ?? null;
    }

    // Nothing mapped for this page → no hreflang output
    if ( $map === null || empty( $map ) ) return;

    // ── Build tags ─────────────────────────────────────────────────────────
    $tags = [];

    // This site's own tag
    $this_locale_hreflang = wss_locale_to_hreflang( $config['this_locale'] );
    $tags[] = [
        'hreflang' => $this_locale_hreflang,
        'url'      => esc_url( $current_url ),
    ];

    // Connected sites (full mode only)
    $xdefault_url = $current_url; // default x-default = this site

    foreach ( $map as $entry ) {
        $site_id = $entry['site_id'] ?? '';

        // Find connection config for this site_id
        $conn = null;
        foreach ( $full_connections as $c ) {
            if ( ( $c['site_id'] ?? '' ) === $site_id ) {
                $conn = $c;
                break;
            }
        }

        // This site_id is inventory_only or not found → skip hreflang
        if ( $conn === null ) continue;

        $locale    = $conn['locale'] ?? '';
        $entry_url = $entry['product_url'] ?? $entry['page_url'] ?? '';

        if ( empty( $locale ) || empty( $entry_url ) ) continue;

        $tags[] = [
            'hreflang' => wss_locale_to_hreflang( $locale ),
            'url'      => esc_url( $entry_url ),
        ];
    }

    // Need at least 2 languages to be worth outputting
    if ( count( $tags ) < 2 ) return;

    // ── x-default: use the nl_NL / primary site, or first tag ─────────────
    $xdefault = $current_url;
    foreach ( $tags as $t ) {
        // Prefer nl_NL or nl as x-default
        if ( in_array( $t['hreflang'], [ 'nl', 'nl-NL', 'nl-nl' ], true ) ) {
            $xdefault = $t['url'];
            break;
        }
    }

    // ── Output ─────────────────────────────────────────────────────────────
    echo "\n<!-- WooSyncShop hreflang -->\n";
    foreach ( $tags as $tag ) {
        printf(
            '<link rel="alternate" hreflang="%s" href="%s">' . "\n",
            esc_attr( $tag['hreflang'] ),
            $tag['url']
        );
    }
    printf(
        '<link rel="alternate" hreflang="x-default" href="%s">' . "\n",
        esc_url( $xdefault )
    );
    echo "<!-- /WooSyncShop hreflang -->\n\n";
}


// ─────────────────────────────────────────────────────────────────────────────
// 4.  ADMIN PAGE  –  Token setup + status
// ─────────────────────────────────────────────────────────────────────────────

function wss_admin_menu() {
    add_submenu_page(
        'woocommerce',
        'WooSyncShop',
        'WooSyncShop',
        'manage_woocommerce',
        'woosyncshop',
        'wss_admin_page'
    );
}

function wss_admin_settings() {
    register_setting( 'wss_settings', WSS_OPTION_KEY, 'wss_sanitize_options' );
}

function wss_sanitize_options( $input ) {
    $config = wss_get_config();
    if ( ! empty( $input['api_token'] ) ) {
        $config['api_token'] = sanitize_text_field( $input['api_token'] );
    }
    return $config;
}

function wss_admin_page() {
    $config     = wss_get_config();
    $token      = $config['api_token']    ?? '';
    $updated_at = $config['updated_at']   ?? null;
    $site_id    = $config['this_site_id'] ?? '—';
    $locale     = $config['this_locale']  ?? '—';
    $prod_count = count( $config['product_map'] ?? [] );
    $page_count = count( $config['page_map']    ?? [] );
    $conns      = $config['connections']        ?? [];
    $rest_url   = rest_url( 'woosyncshop/v1' );
    $ping_url   = $rest_url . '/ping';
    $log        = get_option( WSS_LOG_KEY, [] );

    ?>
    <div class="wrap">
      <h1>🔗 WooSyncShop Companion</h1>

      <?php if ( isset( $_GET['settings-updated'] ) ) : ?>
        <div class="notice notice-success is-dismissible"><p>Token opgeslagen.</p></div>
      <?php endif; ?>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:1000px;margin-top:16px;">

        <!-- Status card -->
        <div style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:20px;">
          <h2 style="margin-top:0">Status</h2>
          <table class="form-table" style="margin:0">
            <tr><th>REST endpoint</th><td><code><?php echo esc_html( $rest_url ); ?></code></td></tr>
            <tr><th>Site ID (platform)</th><td><?php echo esc_html( $site_id ); ?></td></tr>
            <tr><th>Locale</th><td><?php echo esc_html( $locale ); ?></td></tr>
            <tr><th>Verbonden shops</th><td><?php echo count( $conns ); ?> shop(s)</td></tr>
            <tr><th>Producten gemapt</th><td><?php echo $prod_count; ?></td></tr>
            <tr><th>Pagina's gemapt</th><td><?php echo $page_count; ?></td></tr>
            <tr><th>Laatste sync</th><td><?php echo $updated_at ? esc_html( date_i18n( 'd M Y H:i', strtotime( $updated_at ) ) ) : '—'; ?></td></tr>
          </table>

          <?php if ( ! empty( $conns ) ) : ?>
            <h3>Verbonden shops</h3>
            <ul style="margin:0;padding-left:16px;">
              <?php foreach ( $conns as $c ) : ?>
                <li>
                  <strong><?php echo esc_html( $c['site_id'] ?? '?' ); ?></strong>
                  (<?php echo esc_html( $c['locale'] ?? '?' ); ?>) –
                  <?php if ( ( $c['mode'] ?? 'full' ) === 'inventory_only' ) : ?>
                    <span style="color:#d63638">Alleen voorraad (geen hreflang)</span>
                  <?php else : ?>
                    <span style="color:#00a32a">Volledig gesynchroniseerd + hreflang</span>
                  <?php endif; ?>
                </li>
              <?php endforeach; ?>
            </ul>
          <?php endif; ?>
        </div>

        <!-- Token form -->
        <div style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:20px;">
          <h2 style="margin-top:0">Verbinding instellen</h2>
          <p style="color:#666">Voer de API token in die je vindt op het WooSyncShop dashboard onder <em>Instellingen → Shops → API token</em>.</p>
          <form method="post" action="options.php">
            <?php settings_fields( 'wss_settings' ); ?>
            <table class="form-table">
              <tr>
                <th><label for="wss_token">API Token</label></th>
                <td>
                  <input type="password" id="wss_token" name="<?php echo esc_attr( WSS_OPTION_KEY ); ?>[api_token]"
                         value="<?php echo esc_attr( $token ); ?>" class="regular-text" autocomplete="off" />
                  <p class="description">Dit token authenticateert de push-berichten van het WooSyncShop platform naar deze site.</p>
                </td>
              </tr>
            </table>
            <?php submit_button( 'Token opslaan' ); ?>
          </form>

          <hr />
          <h3>Verbinding testen</h3>
          <p>
            <button type="button" id="wss-ping-btn" class="button button-secondary"
                    <?php echo empty( $token ) ? 'disabled title="Sla eerst een token op."' : ''; ?>>
              Verbinding testen
            </button>
            <span id="wss-ping-spinner" class="spinner" style="float:none;margin:0 6px;vertical-align:middle;visibility:hidden;"></span>
          </p>
          <div id="wss-ping-result" style="display:none;margin-top:8px;"></div>
          <script>
          (function($){
            $('#wss-ping-btn').on('click', function(){
              var $btn     = $(this);
              var $spinner = $('#wss-ping-spinner');
              var $result  = $('#wss-ping-result');
              $btn.prop('disabled', true);
              $spinner.css('visibility','visible');
              $result.hide().removeClass('notice-success notice-error').html('');
              $.post(ajaxurl, {
                action: 'wss_ping_test',
                nonce:  <?php echo json_encode( wp_create_nonce( 'wss_ping_nonce' ) ); ?>
              }, function(res){
                $btn.prop('disabled', false);
                $spinner.css('visibility','hidden');
                if (res.success) {
                  $result.addClass('notice notice-success inline')
                    .html('<p>\u2705 ' + res.data.message + '</p>').show();
                } else {
                  $result.addClass('notice notice-error inline')
                    .html('<p>\u274c ' + (res.data ? res.data.message : 'Onbekende fout.') + '</p>').show();
                }
              }).fail(function(){
                $btn.prop('disabled', false);
                $spinner.css('visibility','hidden');
                $result.addClass('notice notice-error inline')
                  .html('<p>\u274c Netwerkfout: kon WooSyncShop niet bereiken.</p>').show();
              });
            });
          }(jQuery));
          </script>
        </div>
      </div>

      <!-- Recent log -->
      <?php if ( ! empty( $log ) ) : ?>
        <div style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:20px;max-width:1000px;margin-top:20px;">
          <h2 style="margin-top:0">Activiteitenlog (laatste 20)</h2>
          <table class="widefat striped" style="font-size:13px;">
            <thead><tr><th width="180">Tijdstip</th><th>Bericht</th></tr></thead>
            <tbody>
              <?php foreach ( array_reverse( array_slice( $log, -20 ) ) as $entry ) : ?>
                <tr>
                  <td><?php echo esc_html( $entry['time'] ?? '' ); ?></td>
                  <td><?php echo esc_html( $entry['msg']  ?? '' ); ?></td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      <?php endif; ?>
    </div>
    <?php
}


// ─────────────────────────────────────────────────────────────────────────────
// 5.  AJAX HANDLER  –  Inline ping test (no new tab)
// ─────────────────────────────────────────────────────────────────────────────

function wss_ajax_ping_test() {
    check_ajax_referer( 'wss_ping_nonce', 'nonce' );

    if ( ! current_user_can( 'manage_woocommerce' ) ) {
        wp_send_json_error( [ 'message' => 'Geen rechten.' ], 403 );
    }

    $config = wss_get_config();
    $token  = $config['api_token'] ?? '';

    if ( empty( $token ) ) {
        wp_send_json_error( [ 'message' => 'Geen API-token ingesteld. Sla eerst een token op.' ] );
    }

    $ping_url = rest_url( 'woosyncshop/v1/ping' );

    $response = wp_remote_get( $ping_url, [
        'timeout' => 10,
        'headers' => [ 'X-WSS-Token' => $token ],
    ] );

    if ( is_wp_error( $response ) ) {
        wp_send_json_error( [ 'message' => 'Verbindingsfout: ' . $response->get_error_message() ] );
    }

    $code = wp_remote_retrieve_response_code( $response );
    $body = json_decode( wp_remote_retrieve_body( $response ), true );

    if ( $code === 200 && ( $body['status'] ?? '' ) === 'ok' ) {
        $wc  = $body['wc']   ? ' · WooCommerce ' . esc_html( $body['wc'] ) : '';
        $site = esc_html( $body['site'] ?? get_bloginfo( 'name' ) );
        wp_send_json_success( [
            'message' => 'Verbinding geslaagd! ' . $site . $wc . ' · token geaccepteerd.',
        ] );
    } else {
        $err = $body['message'] ?? ( 'HTTP ' . $code );
        wp_send_json_error( [ 'message' => 'Verbinding mislukt: ' . esc_html( $err ) ] );
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// 6.  HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function wss_get_config(): array {
    $defaults = [
        'api_token'    => '',
        'this_site_id' => '',
        'this_locale'  => '',
        'connections'  => [],
        'product_map'  => [],
        'page_map'     => [],
        'updated_at'   => null,
    ];
    $stored = get_option( WSS_OPTION_KEY, [] );
    return array_merge( $defaults, is_array( $stored ) ? $stored : [] );
}

/**
 * Convert WP locale (nl_NL) → BCP-47 hreflang (nl-NL)
 */
function wss_locale_to_hreflang( string $locale ): string {
    return str_replace( '_', '-', $locale );
}

function wss_sanitize_connections( array $conns ): array {
    $clean = [];
    foreach ( $conns as $c ) {
        if ( empty( $c['site_id'] ) || empty( $c['locale'] ) || empty( $c['base_url'] ) ) continue;
        $clean[] = [
            'site_id'  => sanitize_text_field( $c['site_id'] ),
            'locale'   => sanitize_text_field( $c['locale'] ),
            'base_url' => esc_url_raw( $c['base_url'] ),
            'mode'     => in_array( $c['mode'] ?? 'full', [ 'full', 'inventory_only' ] ) ? $c['mode'] : 'full',
        ];
    }
    return $clean;
}

function wss_sanitize_map( $map ): array {
    if ( ! is_array( $map ) && ! is_object( $map ) ) return [];
    $clean = [];
    foreach ( (array) $map as $local_id => $entries ) {
        if ( ! is_array( $entries ) ) continue;
        $clean[ (string) $local_id ] = array_map( function( $e ) {
            return [
                'site_id'     => sanitize_text_field( $e['site_id']     ?? '' ),
                'product_id'  => absint( $e['product_id']  ?? 0 ),
                'page_id'     => absint( $e['page_id']     ?? 0 ),
                'product_url' => esc_url_raw( $e['product_url'] ?? '' ),
                'page_url'    => esc_url_raw( $e['page_url']    ?? '' ),
            ];
        }, $entries );
    }
    return $clean;
}

function wss_log( string $msg ): void {
    $log   = get_option( WSS_LOG_KEY, [] );
    $log[] = [ 'time' => current_time( 'd M Y H:i:s' ), 'msg' => $msg ];
    // Keep last 100 entries
    if ( count( $log ) > 100 ) {
        $log = array_slice( $log, -100 );
    }
    update_option( WSS_LOG_KEY, $log, false );
}
