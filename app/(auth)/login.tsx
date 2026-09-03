import React, { useState, useEffect } from "react";
import { View, Text, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, SafeAreaView, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/context/AuthContext";
import { loginUser } from "@/services/authService";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LanguageDropdown } from "@/src/components/i18n/LanguageDropdown";
import { useTranslationSafe } from "@/src/hooks/useTranslationSafe";
import { PrivacyPolicyConsentModal, PRIVACY_POLICY_STORAGE_KEY } from "@/components/PrivacyPolicyConsentModal";
import { useColorScheme } from "@/hooks/use-color-scheme";
import api from "@/services/api";
import * as Device from "expo-device";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [isPrivacyAccepted, setIsPrivacyAccepted] = useState(false);
  const { setUser } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslationSafe(['auth', 'common']);

  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const checkPrivacyStatus = async () => {
      try {
        const stored = await AsyncStorage.getItem(PRIVACY_POLICY_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.accepted) {
            setIsPrivacyAccepted(true);
            return;
          }
        }
        // Not accepted yet - prompt immediately on app open
        setShowPrivacyModal(true);
      } catch (err) {
        setShowPrivacyModal(true);
      }
    };
    checkPrivacyStatus();
  }, []);

  const handleLogin = async () => {
    // 1. Mandatory Privacy Policy Verification
    if (!isPrivacyAccepted) {
      setShowPrivacyModal(true);
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      Alert.alert(t('common:error', { defaultValue: 'Error' }), t('auth:error_enter_both', { defaultValue: 'Please enter both email and password.' }));
      return;
    }
    
    setIsLoading(true);
    try {
      const userData = await loginUser({ email: trimmedEmail, password: trimmedPassword });

      // Record & sync privacy acceptance acknowledgment tied to this user ID
      try {
        let deviceInfo = 'Mobile Device';
        try {
          const mfg = Device.manufacturer || 'Android';
          const model = Device.modelName || 'Device';
          const os = Device.osVersion || 'OS';
          deviceInfo = `${mfg} ${model} (Android ${os})`.trim();
        } catch (dErr) {
          deviceInfo = 'Mobile App Device';
        }

        await api.post('/acknowledgments', {
          userId: userData.id || userData._id,
          employeeName: userData.name,
          employeeEmail: userData.email,
          deviceInfo,
          termsVersion: 'v1.0',
          consentDetails: {
            privacyTermsConsent: true,
            locationTrackingConsent: true,
            backgroundTelemetryConsent: true,
            cameraAccessConsent: true,
            notificationsConsent: true
          }
        });
      } catch (ackErr) {
        console.warn('[LoginScreen] Acknowledgment sync warning:', ackErr);
      }

      setUser(userData);
    } catch (err: any) {
      const serverMsg = err?.response?.data?.error || err?.message || t('auth:invalid_credentials', { defaultValue: 'Invalid credentials.' });
      Alert.alert(t('common:error', { defaultValue: 'Login Failed' }), serverMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#FAFAFA' }}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 30}
      >
        <ScrollView 
          contentContainerClassName="px-6 pt-6 pb-12" 
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 }}>
            <LanguageDropdown />
          </View>
          
          <View className="items-center mb-10">
            {/* Corporate HRMS Emblem Logo */}
            <View className={`w-20 h-20 rounded-2xl items-center justify-center mb-4 border shadow-sm ${isDark ? 'bg-blue-950/60 border-blue-800' : 'bg-primary/10 border-primary/20'}`}>
              <Text className={`text-3xl font-extrabold ${isDark ? 'text-sky-400' : 'text-primary'}`}>HR</Text>
            </View>
            <Text className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-text-main'}`}>{t('auth:login_title', { defaultValue: 'Welcome Back' })}</Text>
            <Text className={`mt-2 text-base text-center ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
              {t('auth:login_subtitle', { defaultValue: 'Sign in to your corporate HRMS account' })}
            </Text>
          </View>

          <View className="space-y-4 gap-4">
            <Input
              label={t('auth:email_label', { defaultValue: 'Work Email' })}
              placeholder={t('auth:email_placeholder', { defaultValue: 'name@company.com' })}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            
            <View style={{ position: 'relative' }}>
              <Input
                label={t('auth:password_label', { defaultValue: 'Password' })}
                placeholder={t('auth:password_placeholder', { defaultValue: 'Enter your password' })}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                className="pr-16"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 16,
                  top: 36,
                  height: 48,
                  justifyContent: 'center',
                  zIndex: 10,
                }}
              >
                <Text style={{ color: isDark ? '#38BDF8' : '#007AFF', fontWeight: 'bold', fontSize: 14 }}>
                  {showPassword ? t('auth:hide', { defaultValue: 'Hide' }) : t('auth:show', { defaultValue: 'Show' })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="mt-8 gap-4">
            <Button 
              onPress={handleLogin} 
              isLoading={isLoading}
              variant="primary"
            >
              {t('auth:sign_in_btn', { defaultValue: 'Sign In' })}
            </Button>
            
            <Button 
              variant="outline"
              onPress={() => Alert.alert(t('auth:coming_soon', { defaultValue: 'Coming Soon' }), t('auth:biometric_soon', { defaultValue: 'Biometric login will be available soon.' }))}
            >
              {t('auth:face_id_btn', { defaultValue: 'Sign in with Face ID' })}
            </Button>

            <TouchableOpacity 
              onPress={() => setShowPrivacyModal(true)} 
              className="items-center py-2 mt-2"
              activeOpacity={0.7}
            >
              <Text className={`text-xs text-center ${isDark ? 'text-slate-400' : 'text-text-muted'}`}>
                🔒 Enterprise Policy: <Text className={`font-semibold underline ${isDark ? 'text-sky-400' : 'text-primary'}`}>Privacy & Permissions Disclosure</Text>
              </Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Mandatory Prominent Privacy Policy & Permission Disclosure Modal */}
      <PrivacyPolicyConsentModal
        visible={showPrivacyModal}
        onAccept={() => {
          setIsPrivacyAccepted(true);
          setShowPrivacyModal(false);
        }}
      />
    </SafeAreaView>
  );
}