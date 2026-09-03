import { Pressable,Text,StyleSheet } from "react-native";

export default function CustomButton({
  title,
  onPress,
}: any){
    return(
        <Pressable
            style={styles.button}
            onPress={onPress}
        >
            <Text
                style={styles.text}
            >
                {title}
            </Text>
        </Pressable>
    );
}
const styles = StyleSheet.create({
  button: {
    backgroundColor: "#007AFF",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },

  text: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    letterSpacing: 0.5,
  },
});