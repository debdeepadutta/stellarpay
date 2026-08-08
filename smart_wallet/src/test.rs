#![cfg(test)]

use super::*;

#[test]
fn test_base64url_encode() {
    let input = [0u8; 32];
    let encoded = base64url_encode_32(&input);
    let expected = b"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    assert_eq!(&encoded, expected);
    
    // Test with a non-zero payload
    // Base64url of [1..32]
    let mut input2 = [0u8; 32];
    for i in 0..32 {
        input2[i] = i as u8;
    }
    let encoded2 = base64url_encode_32(&input2);
    // Let's verify character validity
    for &c in encoded2.iter() {
        assert!(
            (c >= b'A' && c <= b'Z') ||
            (c >= b'a' && c <= b'z') ||
            (c >= b'0' && c <= b'9') ||
            c == b'-' || c == b'_'
        );
    }
}

#[test]
fn test_json_parsing() {
    let json_str = b"{\"type\":\"webauthn.get\",\"challenge\":\"c29tZV9jaGFsbGVuZ2VfZm9yX3Rlc3Rpbmc\",\"origin\":\"http://localhost\"}";
    let (client_data, _): (ClientDataJson, usize) = serde_json_core::from_slice(json_str).unwrap();
    assert_eq!(client_data.challenge, "c29tZV9jaGFsbGVuZ2VfZm9yX3Rlc3Rpbmc");
}


// fmt