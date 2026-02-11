package net.tradeaura.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// OneSignal Cordova plugin
import com.onesignal.cordova.OneSignalPush;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    registerPlugin(OneSignalPush.class);
  }
}
