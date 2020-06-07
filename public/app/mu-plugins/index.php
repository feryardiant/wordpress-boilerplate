<?php
// Silence is golden.

/**
 * Lil hack to get valid self-signed SSL while development.
 * @see https://stackoverflow.com/a/62249579/881743
 */
add_filter( 'http_request_args', function ( $args ) {
    if ( getenv( 'WP_ENV' ) !== 'development' ) {
        return $args;
    }

    $args['sslcertificates'] = ini_get( 'curl.cainfo' ) ?? $args['sslcertificates'];

    return $args;
}, 0, 1 );
