import { View, Text, Platform } from "react-native";
import { Card, CardContent } from "./ui/Card";

type AttendanceCardProps = {
  status: string;
  checkInTime: string;
  checkOutTime: string;
  workingHours: string;
  liveTimer: string;
};

export default function AttendanceCard({ status, checkInTime, checkOutTime, workingHours, liveTimer }: AttendanceCardProps) {
  const isCheckedIn = status === "Checked In";
  const badgeColor = isCheckedIn ? "text-emerald-600 bg-emerald-50 border-emerald-200" : "text-gray-500 bg-gray-50 border-gray-200";
  const dotColor = isCheckedIn ? "bg-emerald-500" : "bg-gray-400";
  const badgeText = isCheckedIn ? "Active" : "Offline";

  return (
    <Card className="w-11/12 mb-5">
      <CardContent>
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-base font-black text-text-main uppercase tracking-widest">Shift Tracker</Text>
          <View className={`flex-row items-center py-1 px-3 rounded-full border ${badgeColor}`}>
            <View className={`w-1.5 h-1.5 rounded-full mr-2 ${dotColor}`} />
            <Text className={`text-xs font-bold ${isCheckedIn ? 'text-emerald-600' : 'text-gray-500'}`}>{badgeText}</Text>
          </View>
        </View>
        
        {isCheckedIn && (
          <View className="flex-row items-baseline bg-red-50/50 py-2 px-3 rounded-lg mb-4">
            <Text className="text-xs font-bold text-red-500 mr-2">Live Duration:</Text>
            <Text className="text-sm font-bold text-red-500 font-mono tracking-wider">{liveTimer}</Text>
            <Text className="text-xs text-text-muted"> / 08:00:00</Text>
          </View>
        )}

        <View className="h-px bg-border/50 mb-4" />

        <View className="flex-row justify-between">
          <View className="flex-1 items-center">
            <Text className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-1">Clock In</Text>
            <Text className="text-sm font-black text-text-main">{checkInTime || "--:--"}</Text>
          </View>
          <View className="flex-1 items-center border-l border-r border-border/50">
            <Text className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-1">Clock Out</Text>
            <Text className="text-sm font-black text-text-main">{checkOutTime || "--:--"}</Text>
          </View>
          <View className="flex-1 items-center">
            <Text className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-1">Total Time</Text>
            <Text className="text-sm font-black text-text-main">{workingHours || "--h --m"}</Text>
          </View>
        </View>
      </CardContent>
    </Card>
  );
}